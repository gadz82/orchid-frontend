/**
 * Phases 2 + 4A + 4B (frontend side).
 *
 * Tiny HTTP client for orchid-api's three secret-bearing endpoints:
 *
 *   - ``POST /auth/exchange-code``    (Phase 2 — initial code grant)
 *   - ``POST /auth/refresh-token``    (Phase 4B — refresh grant)
 *   - ``POST /auth/resolve-identity`` (Phase 4A — identity bridge)
 *
 * Used by NextAuth's token + userinfo callbacks (initial sign-in)
 * and by our custom :func:`refreshAccessToken` (silent refresh).
 *
 * The exchange + refresh endpoints are unauthenticated on the
 * orchid-api side — their protection is the natural OAuth-grant
 * guards (PKCE + single-use code for exchange, refresh-token-as-
 * bearer for refresh).  ``/auth/resolve-identity`` is also
 * unauthenticated — the upstream access token is itself the proof
 * of identity.  No Authorization header travels with these calls.
 *
 * Field names mirror the Python DTOs verbatim so a server-side
 * rename surfaces as a runtime parse error rather than silent
 * corruption.  See:
 *   - :class:`orchid_api.routers.auth_exchange.ExchangeCodeRequest`
 *     / ``RefreshTokenRequest`` / ``ExchangeCodeResponse``
 *   - :class:`orchid_api.routers.auth_identity.ResolveIdentityRequest`
 *     / ``ResolveIdentityResponse``
 */

import {AGENTS_API_URL} from "@/app/actions/_api-config";

export interface ExchangeCodeRequest {
    code: string;
    redirect_uri: string;
    code_verifier?: string;
}

export interface RefreshTokenRequest {
    refresh_token: string;
}

export interface UpstreamTokenResponse {
    access_token: string;
    token_type?: string;
    refresh_token?: string;
    /** Lifetime in seconds, as reported by the upstream IdP. */
    expires_in?: number;
    scope?: string;
}

export interface ResolveIdentityRequest {
    access_token: string;
    auth_domain?: string;
}

export interface ResolveIdentityResponse {
    subject: string;
    bearer: string;
    auth_domain: string;
    email: string;
    extra: Record<string, unknown>;
}

export class CentralisedExchangeError extends Error {
    constructor(
        message: string,
        readonly statusCode: number,
    ) {
        super(message);
        this.name = "CentralisedExchangeError";
    }
}

/**
 * POST ``/auth/exchange-code``.  Phase 2 of the roadmap — the
 * frontend forwards the upstream authorization code (+ PKCE
 * verifier) to orchid-api, which holds the upstream
 * ``client_secret`` and performs the actual ``token_endpoint`` POST
 * on our behalf.  The response shape is RFC 6749 §5.1 — drop-in
 * replacement for what the upstream IdP would have returned.
 */
export async function exchangeAuthorizationCode(
    request: ExchangeCodeRequest,
): Promise<UpstreamTokenResponse> {
    const res = await fetch(`${AGENTS_API_URL}/auth/exchange-code`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const detail = await safeReadDetail(res);
        throw new CentralisedExchangeError(
            `orchid-api /auth/exchange-code returned ${String(res.status)}: ${detail}`,
            res.status,
        );
    }
    return (await res.json()) as UpstreamTokenResponse;
}

/**
 * POST ``/auth/refresh-token``.  Phase 4B counterpart to
 * :func:`exchangeAuthorizationCode` — the frontend posts the
 * upstream refresh token to orchid-api, which performs the upstream
 * token-endpoint exchange with its copy of ``client_secret`` and
 * returns a freshly-rotated access/refresh pair.
 *
 * Failure semantics: orchid-api returns 503 when no
 * :class:`OrchidAuthExchangeClient` is wired or when the wired one
 * doesn't override ``refresh_token``; treat that the same as the
 * upstream rejecting the refresh — surface as ``RefreshAccessTokenError``
 * so the user is forced through a fresh login.
 */
export async function refreshUpstreamToken(
    request: RefreshTokenRequest,
): Promise<UpstreamTokenResponse> {
    const res = await fetch(`${AGENTS_API_URL}/auth/refresh-token`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const detail = await safeReadDetail(res);
        throw new CentralisedExchangeError(
            `orchid-api /auth/refresh-token returned ${String(res.status)}: ${detail}`,
            res.status,
        );
    }
    return (await res.json()) as UpstreamTokenResponse;
}

/**
 * POST ``/auth/resolve-identity``.  Phase 4A — turn an upstream
 * access token into the normalised identity payload (``subject`` /
 * ``bearer`` / ``auth_domain`` / ``email`` / ``extra``) the
 * frontend's NextAuth ``profile()`` hook stuffs into the JWT.
 * Replaces the upstream userinfo call entirely — the frontend no
 * longer needs to know the userinfo URL or any JSON-path hints
 * for non-OIDC shapes.
 */
export async function resolveIdentity(
    request: ResolveIdentityRequest,
): Promise<ResolveIdentityResponse> {
    const res = await fetch(`${AGENTS_API_URL}/auth/resolve-identity`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify(request),
    });
    if (!res.ok) {
        const detail = await safeReadDetail(res);
        throw new CentralisedExchangeError(
            `orchid-api /auth/resolve-identity returned ${String(res.status)}: ${detail}`,
            res.status,
        );
    }
    return (await res.json()) as ResolveIdentityResponse;
}

async function safeReadDetail(res: Response): Promise<string> {
    try {
        const text = await res.text();
        return text.slice(0, 200);
    } catch {
        return "<unreadable body>";
    }
}
