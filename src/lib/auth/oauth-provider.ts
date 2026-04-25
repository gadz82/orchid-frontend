/**
 * Generic OAuth2 / OpenID Connect provider for NextAuth v5,
 * **fully delegated to orchid-api**.
 *
 * The frontend's OAuth surface is reduced to two responsibilities:
 *   1. Send the user's browser to the upstream IdP's ``/authorize``
 *      endpoint (PKCE-protected redirect; no secret involved).
 *   2. Hand off the resulting code + claims-resolution to
 *      orchid-api's ``/auth/exchange-code`` and
 *      ``/auth/resolve-identity`` endpoints (Phases 2 + 4A).
 *
 * The provider's ``token`` callback POSTs to
 * ``/auth/exchange-code`` instead of hitting the upstream
 * ``token_endpoint`` — Phase 2 of the auth-centralisation roadmap.
 * The ``userinfo`` callback POSTs to ``/auth/resolve-identity`` —
 * Phase 4A.  Together these mean the frontend holds no
 * ``client_secret`` and knows no ``userinfo_endpoint`` /
 * ``token_endpoint`` URL.
 *
 * The provider builds its config from values resolved by
 * :func:`getCentralisedOAuthConfig` (Phase 1 discovery from
 * orchid-api's ``/auth-info``) — there are no ``OAUTH_*`` env-var
 * fallbacks for the upstream URLs.  The provider type is
 * ``"oauth"`` (not ``"oidc"``) because we deliberately bypass
 * Auth.js's OIDC discovery — orchid-api owns that.
 */

import type {OAuthConfig, OAuthUserConfig} from "next-auth/providers";

import {
    exchangeAuthorizationCode,
    resolveIdentity,
} from "./centralised-exchange";

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
     * ``/auth/resolve-identity`` so multi-tenant deployments resolve
     * the right tenant (matches the gateway's
     * ``ORCHID_MCP_OAUTH_AUTH_DOMAIN`` setting in shape).
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
 * Token callback used by Auth.js v5.  Auth.js calls this with a
 * payload that includes the upstream ``code`` extracted from the
 * redirect, the PKCE ``code_verifier`` it stashed before the
 * redirect, and the registered redirect URI; we forward those
 * three to orchid-api's ``/auth/exchange-code`` verbatim.
 *
 * The Auth.js param shape is intentionally untyped here (the
 * upstream typings are an internal API).  We narrow at the call
 * site to keep the public surface tight.
 */
function buildTokenCallback(): NonNullable<OAuthConfig<OAuthProfile>["token"]> {
    return async (params: unknown) => {
        const p = params as {
            params?: Record<string, string | undefined>;
            request?: {url?: string};
            checks?: {code_verifier?: string};
            provider?: {callbackUrl?: string};
        };
        const code = p.params?.code;
        if (typeof code !== "string" || code.length === 0) {
            throw new Error(
                "[auth:exchange] missing `code` in Auth.js token-callback params",
            );
        }
        const redirectUri =
            p.provider?.callbackUrl ??
            (p.request?.url !== undefined
                ? new URL(p.request.url).origin + "/api/auth/callback/oauth"
                : undefined);
        if (redirectUri === undefined) {
            throw new Error("[auth:exchange] could not determine redirect_uri");
        }
        const codeVerifier = p.checks?.code_verifier;
        const tokens = await exchangeAuthorizationCode({
            code,
            redirect_uri: redirectUri,
            ...(codeVerifier !== undefined ? {code_verifier: codeVerifier} : {}),
        });
        const expiresAt =
            typeof tokens.expires_in === "number"
                ? Math.floor(Date.now() / 1000) + tokens.expires_in
                : undefined;
        return {
            tokens: {
                access_token: tokens.access_token,
                token_type: tokens.token_type ?? "Bearer",
                ...(tokens.refresh_token !== undefined
                    ? {refresh_token: tokens.refresh_token}
                    : {}),
                ...(tokens.expires_in !== undefined
                    ? {expires_in: tokens.expires_in}
                    : {}),
                ...(expiresAt !== undefined ? {expires_at: expiresAt} : {}),
                ...(tokens.scope !== undefined ? {scope: tokens.scope} : {}),
            },
        };
    };
}

/**
 * Userinfo callback used by Auth.js v5.  POSTs the upstream access
 * token to orchid-api's ``/auth/resolve-identity`` and projects the
 * response onto the :type:`OAuthProfile` shape Auth.js expects.
 *
 * The frontend's ``profile()`` hook then turns that into the
 * NextAuth user object (``{id, name, email, image}``) — we map
 * ``subject`` to ``sub`` to keep the existing :func:`sharedProfile`
 * mapping working.
 */
function buildUserinfoCallback(
    authDomain: string | undefined,
): NonNullable<OAuthConfig<OAuthProfile>["userinfo"]> {
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

export default function GenericOAuthProvider(
    options: GenericOAuthProviderOptions,
): OAuthConfig<OAuthProfile> {
    const scope = options.scope ?? "openid profile email";
    return {
        id: "oauth",
        name: "OAuth",
        // ``oauth`` (not ``oidc``) — orchid-api owns the token +
        // userinfo concerns, so Auth.js's OIDC auto-discovery
        // would only get in the way.
        type: "oauth",
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        checks: ["state", "pkce"],
        issuer: options.issuer,
        authorization: {
            url: options.authorizationUrl,
            params: {scope, response_type: "code"},
        },
        token: buildTokenCallback(),
        userinfo: buildUserinfoCallback(options.authDomain),
        profile: sharedProfile,
        options,
    } as OAuthConfig<OAuthProfile>;
}
