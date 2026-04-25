/**
 * Phase 1 of the auth-centralisation roadmap (frontend side).
 *
 * Fetches ``GET /auth-info`` from ``orchid-api`` once per process and
 * caches the result.  This is the **only** source of upstream-OAuth
 * config for the frontend — there are no ``OAUTH_*`` env-var
 * fallbacks because Phases 1–4 have removed every piece of upstream
 * config from this side.  The frontend's complete OAuth env surface
 * is :envvar:`AGENTS_API_URL` + :envvar:`DEV_AUTH_BYPASS`.
 *
 * The endpoint is unauthenticated by design (discovery happens BEFORE
 * the user has a token).  The ``oauth.exchange_via_api`` /
 * ``resolve_via_api`` / ``refresh_via_api`` flags are expected to be
 * ``true`` — they're the contract that orchid-api will host every
 * secret-bearing call on the frontend's behalf.  When discovery
 * returns ``oauth=null`` (no provider wired) or any flag is ``false``
 * the frontend falls into a degraded state where login won't work;
 * :func:`getAuthInfo` exposes the raw payload and the consuming
 * NextAuth config decides how to surface that.
 *
 * Caching strategy: the fetch is wrapped in a singleton
 * :class:`Promise` so concurrent callers share one in-flight request,
 * and a successful response is cached indefinitely.  Failed lookups
 * DO NOT cache so a transient network blip during cold-start doesn't
 * poison the lifetime of the process.
 */

import {AGENTS_API_URL} from "@/app/actions/_api-config";

/**
 * Mirror of :class:`orchid_api.routers.auth_info.AuthInfoOAuth` over
 * the wire.  Field names match the Python DTO byte-for-byte so a
 * rename on either side surfaces as a clear runtime parse error.
 *
 * The frontend only consumes the fields it actually needs to drive
 * NextAuth (``issuer_url`` for ``iss`` validation, the authorization
 * endpoint for the redirect, ``client_id`` + ``scope`` for the
 * authorize URL).  ``token_endpoint`` / ``userinfo_endpoint`` /
 * JSON-path hints are present in the schema for symmetry with
 * ``orchid-mcp`` but the frontend never reads them — every secret-
 * bearing exchange routes through orchid-api.
 */
export interface AuthInfoOAuth {
    issuer_url: string;
    authorization_endpoint: string;
    token_endpoint: string;
    client_id: string;
    userinfo_endpoint?: string | null;
    scope?: string;
    auth_domain?: string | null;
    userinfo_sub_path?: string | null;
    userinfo_email_path?: string | null;
    /** Phase 2 — POST upstream codes to ``/auth/exchange-code``. */
    exchange_via_api?: boolean;
    /** Phase 4A — POST upstream tokens to ``/auth/resolve-identity``. */
    resolve_via_api?: boolean;
    /** Phase 4B — POST upstream refresh tokens to ``/auth/refresh-token``. */
    refresh_via_api?: boolean;
}

export interface AuthInfo {
    dev_bypass: boolean;
    identity_resolver_configured: boolean;
    oauth?: AuthInfoOAuth | null;
}

/**
 * Module-level promise cache.  Lives across requests in the Next.js
 * server runtime; cleared on process restart.  Initialised lazily on
 * first call so a stale env var doesn't fire a network request at
 * module-load time before the integrator has finished bootstrapping.
 */
let authInfoPromise: Promise<AuthInfo | null> | null = null;

/**
 * Fetch + cache the ``/auth-info`` payload.  Returns ``null`` when the
 * endpoint is unreachable or returns a non-2xx — callers decide how to
 * surface that (typically: the NextAuth provider builder fails the
 * request so the user sees a 500 rather than a half-broken login).
 */
export async function getAuthInfo(): Promise<AuthInfo | null> {
    if (authInfoPromise === null) {
        authInfoPromise = (async () => {
            try {
                const res = await fetch(`${AGENTS_API_URL}/auth-info`, {
                    headers: {Accept: "application/json"},
                });
                if (!res.ok) {
                    console.warn(
                        `[auth:discovery] /auth-info returned ${String(res.status)}`,
                    );
                    authInfoPromise = null; // don't poison the cache
                    return null;
                }
                return (await res.json()) as AuthInfo;
            } catch (err) {
                console.warn("[auth:discovery] /auth-info unreachable:", err);
                authInfoPromise = null;
                return null;
            }
        })();
    }
    return authInfoPromise;
}

/**
 * Stricter wrapper around :func:`getAuthInfo` that fails when the
 * payload doesn't carry the centralisation contract the frontend
 * relies on (``oauth`` block present + all three Phase-2/4 flags
 * enabled).  Returns the validated ``oauth`` block on success.
 *
 * Used by :file:`auth.ts` at NextAuth-config-build time; the loud
 * error surfaces in the server logs as soon as a request hits
 * ``/api/auth/...`` rather than emitting a confusing 401 cascade
 * later.
 */
export async function getCentralisedOAuthConfig(): Promise<AuthInfoOAuth> {
    const info = await getAuthInfo();
    if (info === null) {
        throw new Error(
            "[auth:discovery] /auth-info is unreachable — the orchid-api at " +
                "AGENTS_API_URL must respond to GET /auth-info before the " +
                "frontend can serve OAuth.",
        );
    }
    if (info.oauth === undefined || info.oauth === null) {
        throw new Error(
            "[auth:discovery] /auth-info returned no `oauth` block — wire an " +
                "OrchidAuthConfigProvider on orchid-api (auth.auth_config_provider_class).",
        );
    }
    if (
        info.oauth.exchange_via_api !== true ||
        info.oauth.resolve_via_api !== true ||
        info.oauth.refresh_via_api !== true
    ) {
        throw new Error(
            "[auth:discovery] /auth-info advertises the upstream OAuth block " +
                "but at least one of `exchange_via_api`, `resolve_via_api`, " +
                "`refresh_via_api` is false.  The frontend requires all three " +
                "to be enabled (see auth-centralisation Phases 2 + 4A + 4B).",
        );
    }
    return info.oauth;
}

/**
 * Test-only helper to flush the cached discovery result.  Production
 * code should never need to clear the cache — a frontend restart is
 * the deliberate way to pick up an upstream config change.
 *
 * @internal
 */
export function _resetAuthInfoCacheForTests(): void {
    authInfoPromise = null;
}
