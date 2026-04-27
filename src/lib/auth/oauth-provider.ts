/**
 * Generic OAuth2 / OpenID Connect provider for NextAuth v5,
 * **fully delegated to orchid-api**.
 *
 * Centralisation contract (Phases 2 + 4A of the auth roadmap)
 * -----------------------------------------------------------
 * The frontend holds NO upstream OAuth secrets.  ``client_secret``
 * lives only on the orchid-api side.  Therefore:
 *
 *   1. The browser is sent to the upstream IdP's ``/authorize``
 *      endpoint with PKCE (no secret involved).
 *   2. The resulting authorization code is exchanged through
 *      ``orchid-api/auth/exchange-code`` — orchid-api signs the
 *      ``token_endpoint`` POST with its copy of ``client_secret`` on
 *      our behalf and returns an RFC-6749 §5.1 token response.
 *   3. Identity resolution goes through
 *      ``orchid-api/auth/resolve-identity`` — orchid-api hits the
 *      upstream userinfo endpoint (or any equivalent identity
 *      source) and returns a normalised payload, hiding the upstream
 *      URL + JSON-path quirks from the frontend.
 *
 * Phase 4B (refresh) lives in ``auth.ts:refreshAccessToken`` — it
 * POSTs the refresh token directly to ``orchid-api/auth/refresh-token``
 * outside of Auth.js's pipeline, so this file only deals with the
 * initial code grant + userinfo callback.
 *
 * How we route Auth.js v5 through orchid-api
 * ------------------------------------------
 * Auth.js v5 (via ``oauth4webapi``) always POSTs the token endpoint
 * as the URL recorded in ``as.token_endpoint``.  By default that URL
 * comes from OIDC discovery against ``<issuer>/.well-known/openid-configuration``;
 * we don't want that here because we never want to hit the upstream
 * token endpoint directly.  Setting BOTH ``token.url`` and
 * ``userinfo.url`` on the provider config makes Auth.js skip
 * discovery entirely and use those URLs verbatim — see
 * ``@auth/core/lib/actions/callback/oauth/callback.js`` lines 34-46.
 *
 * That switch introduces a wire-format mismatch.  ``oauth4webapi``
 * POSTs the token endpoint as ``application/x-www-form-urlencoded``
 * with standard OAuth2 fields (``grant_type``, ``code``,
 * ``redirect_uri``, ``code_verifier``, ``client_id``), while
 * orchid-api's ``/auth/exchange-code`` expects a small JSON shape
 * (:class:`ExchangeCodeRequest`).  We close the gap with the
 * ``[customFetch]`` symbol — Auth.js routes every outbound request
 * through it, so we intercept the token-endpoint POST, translate the
 * form body into JSON (forwarding the optional ``auth_domain``), and
 * call orchid-api.  The response shape is already RFC-6749 §5.1 so
 * the return path needs no translation.
 *
 * The userinfo flow is simpler: Auth.js invokes ``userinfo.request``
 * when defined (see ``callback.js:188``), so we provide a callback
 * that POSTs to ``orchid-api/auth/resolve-identity`` directly.  The
 * URL we set on ``userinfo.url`` is purely the discovery-skip marker
 * and is never fetched.
 *
 * Note on token.request — Auth.js v5 does NOT call ``token.request``
 * (only ``token.conform``); a callback shape there is dead code.  We
 * therefore use the URL + customFetch combo, which is the supported
 * extension point.
 */

import {customFetch} from "@auth/core";
import type {OAuthConfig, OAuthUserConfig} from "next-auth/providers";

import {AGENTS_API_URL} from "@/app/actions/_api-config";
import {resolveIdentity} from "./centralised-exchange";

export interface OAuthProfile {
    /** Subject identifier (unique user ID from the IdP). */
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
    /** Any additional claims the resolver chose to surface. */
    [key: string]: unknown;
}

export interface GenericOAuthProviderOptions extends OAuthUserConfig<OAuthProfile> {
    /** OIDC issuer URL — used for the ``iss`` claim only, never for endpoint discovery. */
    issuer: string;
    /** Authorization endpoint the browser is redirected to (PKCE-protected). */
    authorizationUrl: string;
    /** Space-separated scopes (default: ``openid profile email``). */
    scope?: string;
    /**
     * Operator-level platform / tenant domain forwarded to
     * ``/auth/exchange-code`` (in the JSON body) and
     * ``/auth/resolve-identity`` (likewise) so multi-tenant
     * deployments resolve the right tenant.  Single-tenant
     * deployments leave this unset and rely on the
     * ``settings.auth_domain`` default on the orchid-api side.
     */
    authDomain?: string;
}

const sharedProfile = (profile: OAuthProfile) => ({
    id: profile.sub,
    name: profile.name ?? profile.sub,
    email: profile.email ?? "",
    image: profile.picture,
});

/**
 * Userinfo callback used by Auth.js v5.  POSTs the upstream access
 * token to orchid-api's ``/auth/resolve-identity`` and projects the
 * response onto the :type:`OAuthProfile` shape Auth.js expects.
 *
 * Auth.js calls ``userinfo.request`` when it's defined (see
 * ``callback.js:188``), bypassing the URL fetch entirely — so the
 * URL we set on ``userinfo.url`` is purely a marker that disables
 * discovery, never actually fetched.
 */
function buildUserinfoCallback(
    authDomain: string | undefined,
): NonNullable<NonNullable<OAuthConfig<OAuthProfile>["userinfo"]>["request"]> {
    return async (params: unknown) => {
        const p = params as {tokens?: {access_token?: string}};
        const accessToken = p.tokens?.access_token;
        if (typeof accessToken !== "string" || accessToken.length === 0) {
            throw new Error(
                "[auth:userinfo] missing access_token in Auth.js userinfo-callback params",
            );
        }
        const identity = await resolveIdentity({
            access_token: accessToken,
            ...(authDomain !== undefined ? {auth_domain: authDomain} : {}),
        });
        const profile: OAuthProfile = {
            sub: identity.subject,
            ...(identity.email.length > 0 ? {email: identity.email} : {}),
        };
        // Surface any platform-specific extras the resolver chose to
        // expose — they come through verbatim under the [key] index.
        for (const [k, v] of Object.entries(identity.extra)) {
            profile[k] = v;
        }
        return profile;
    };
}

/**
 * Build the ``[customFetch]`` interceptor — the bridge between
 * ``oauth4webapi``'s standard OAuth2 form-encoded token POST and
 * orchid-api's JSON :class:`ExchangeCodeRequest` shape.
 *
 * Only the ``tokenUrl`` POST is intercepted; everything else
 * (authorization endpoint redirects, the rare upstream metadata
 * fetch, etc.) passes through to global ``fetch`` unchanged.  The
 * userinfo URL is never actually fetched (``userinfo.request``
 * handles it), so we don't bother branching on it.
 */
function buildCustomFetch(
    tokenUrl: string,
    authDomain: string | undefined,
): typeof fetch {
    return async function customFetchImpl(input, init) {
        const url =
            typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.toString()
                  : input.url;
        if (url === tokenUrl && init?.method === "POST") {
            // ``oauth4webapi`` posts the body as URLSearchParams.  We
            // accept either that or a string (different Node fetch
            // implementations normalise differently) and translate
            // into JSON for orchid-api.
            const body = init.body;
            const formBody =
                body instanceof URLSearchParams
                    ? body
                    : new URLSearchParams(typeof body === "string" ? body : "");
            const code = formBody.get("code") ?? "";
            const redirectUri = formBody.get("redirect_uri") ?? "";
            const codeVerifier = formBody.get("code_verifier");
            const jsonBody: Record<string, unknown> = {
                code,
                redirect_uri: redirectUri,
            };
            // ``oauth4webapi`` writes a literal ``"decoy"`` placeholder
            // when PKCE isn't configured (see callback.js:111) — drop
            // that, and forward any real verifier verbatim so
            // orchid-api can validate it against the upstream.
            if (codeVerifier !== null && codeVerifier !== "decoy") {
                jsonBody.code_verifier = codeVerifier;
            }
            if (authDomain !== undefined) {
                jsonBody.auth_domain = authDomain;
            }
            return fetch(tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify(jsonBody),
            });
        }
        return fetch(input, init);
    };
}

export default function GenericOAuthProvider(
    options: GenericOAuthProviderOptions,
): OAuthConfig<OAuthProfile> {
    const scope = options.scope ?? "openid profile email";
    const tokenUrl = `${AGENTS_API_URL}/auth/exchange-code`;
    // ``userinfoUrl`` is never actually fetched — ``userinfo.request``
    // takes precedence — but it must be a non-authjs.dev URL so the
    // discovery branch in ``callback.js`` is skipped (see top-of-file).
    const userinfoUrl = `${AGENTS_API_URL}/auth/resolve-identity`;
    return {
        id: "oauth",
        name: "OAuth",
        // ``oauth`` (not ``oidc``) — orchid-api owns the token +
        // userinfo concerns; the upstream ID token, if any, plays no
        // role in the centralised contract.
        type: "oauth",
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        checks: ["state", "pkce"],
        issuer: options.issuer,
        authorization: {
            url: options.authorizationUrl,
            params: {scope, response_type: "code"},
        },
        // Setting BOTH ``token.url`` and ``userinfo.url`` is what
        // disables Auth.js's OIDC discovery (see top-of-file).  We
        // never want it: discovery would point us at the upstream
        // ``token_endpoint``, but the centralisation contract routes
        // every secret-bearing call through orchid-api instead.
        token: {url: new URL(tokenUrl)},
        userinfo: {
            url: new URL(userinfoUrl),
            request: buildUserinfoCallback(options.authDomain),
        },
        // Translate the form-encoded token POST that ``oauth4webapi``
        // emits into orchid-api's JSON shape.
        [customFetch]: buildCustomFetch(tokenUrl, options.authDomain),
        profile: sharedProfile,
        options,
    } as OAuthConfig<OAuthProfile>;
}
