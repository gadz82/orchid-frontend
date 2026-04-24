/**
 * NextAuth v5 configuration — generic OAuth2/OIDC.
 *
 * Key design:
 *   - Standard OAuth: works with any OIDC/OAuth2 provider (Keycloak, Auth0, etc.)
 *   - Token proxy: the access_token is stored ONLY in the server-side JWT.
 *     The browser session never receives the raw token.
 *   - Dev bypass: when DEV_AUTH_BYPASS=true, uses a Credentials provider
 *     with a dummy token for local development.
 */

import NextAuth from "next-auth";
import type {NextAuthConfig} from "next-auth";
import type {JWT} from "@auth/core/jwt";
import Credentials from "next-auth/providers/credentials";
import GenericOAuthProvider from "./oauth-provider";

const isDevBypass = process.env.DEV_AUTH_BYPASS === "true";

/**
 * Skew in seconds applied when deciding whether an access token has
 * expired.  Refreshing slightly before the hard expiry avoids the
 * race where a Server Action picks up an about-to-expire token and
 * hits the backend right as the IdP invalidates it.
 */
const TOKEN_REFRESH_SKEW_SECONDS = 30;

// Extend the built-in types
declare module "next-auth" {
    interface Session {
        accessToken?: string;
        /**
         * Set when the stored refresh_token has failed (e.g. revoked at
         * the IdP).  Server Actions should treat an "error" session as
         * effectively unauthenticated and trigger ``handleUnauthorized``
         * so the user is routed through a fresh login.
         */
        error?: "RefreshAccessTokenError";
        user: {
            id?: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }
}

// In NextAuth v5 the ``JWT`` interface lives in ``@auth/core/jwt`` —
// augmenting ``next-auth/jwt`` no longer resolves under
// ``moduleResolution: bundler`` in the app tsconfig.  Augment the
// upstream module instead so the callback below sees a typed
// ``access_token`` on the token object.
declare module "@auth/core/jwt" {
    interface JWT {
        access_token?: string;
        /** Refresh token held server-side only — never leaked to the browser. */
        refresh_token?: string;
        /** Unix epoch seconds when ``access_token`` expires. */
        expires_at?: number;
        /** Sticky refresh failure marker — surfaced via ``session.error``. */
        error?: "RefreshAccessTokenError";
    }
}

/**
 * Returns ``true`` when the stored ``expires_at`` is within the skew
 * window (or missing — which means we can't trust the token).
 */
function isAccessTokenExpired(expiresAt: number | undefined): boolean {
    if (expiresAt === undefined) return true;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return nowSeconds >= expiresAt - TOKEN_REFRESH_SKEW_SECONDS;
}

/**
 * Normalise NextAuth's ``account.expires_at`` (epoch seconds) and
 * ``account.expires_in`` (seconds from now) into an absolute
 * expiry timestamp.  Provider implementations vary; we accept both.
 */
function resolveExpiresAt(account: Record<string, unknown>): number | undefined {
    const expiresAt = account.expires_at;
    if (typeof expiresAt === "number") return expiresAt;
    const expiresIn = account.expires_in;
    if (typeof expiresIn === "number") {
        return Math.floor(Date.now() / 1000) + expiresIn;
    }
    return undefined;
}

/**
 * Resolve the OAuth token endpoint from the environment.
 *
 * OIDC auto-discovery mode sets ``OAUTH_ISSUER``; explicit-endpoint
 * mode sets ``OAUTH_TOKEN_URL``.  For the issuer case we fetch the
 * ``.well-known/openid-configuration`` once and cache the resolved
 * ``token_endpoint`` — the refresh path runs rarely enough that a
 * simple in-memory cache is sufficient and a cold miss on a cold
 * process restart is cheap.
 */
let cachedTokenEndpoint: string | null = null;
async function resolveTokenEndpoint(): Promise<string | null> {
    if (cachedTokenEndpoint !== null) return cachedTokenEndpoint;
    const explicit = process.env.OAUTH_TOKEN_URL;
    if (explicit !== undefined && explicit.length > 0) {
        cachedTokenEndpoint = explicit;
        return cachedTokenEndpoint;
    }
    const issuer = process.env.OAUTH_ISSUER;
    if (issuer === undefined || issuer.length === 0) return null;
    try {
        const res = await fetch(
            `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {token_endpoint?: string};
        if (typeof data.token_endpoint !== "string") return null;
        cachedTokenEndpoint = data.token_endpoint;
        return cachedTokenEndpoint;
    } catch (err) {
        console.warn("[auth:refresh] failed to resolve OIDC token_endpoint:", err);
        return null;
    }
}

/**
 * Refresh the OAuth access token using the stored refresh token.
 *
 * On success, returns an updated JWT with a new ``access_token``,
 * rotated ``refresh_token`` (if the IdP issues one), and an updated
 * ``expires_at``.  On failure we mark the JWT with ``error`` so the
 * next call surfaces the issue via ``session.error`` and the UI can
 * force a sign-out.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
    if (token.refresh_token === undefined) {
        return {...token, error: "RefreshAccessTokenError"};
    }
    const tokenEndpoint = await resolveTokenEndpoint();
    if (tokenEndpoint === null) {
        console.error(
            "[auth:refresh] cannot resolve token endpoint; set OAUTH_ISSUER or OAUTH_TOKEN_URL",
        );
        return {...token, error: "RefreshAccessTokenError"};
    }
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;
    if (clientId === undefined || clientSecret === undefined) {
        console.error("[auth:refresh] OAUTH_CLIENT_ID/SECRET missing; cannot refresh");
        return {...token, error: "RefreshAccessTokenError"};
    }
    try {
        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
            client_id: clientId,
            client_secret: clientSecret,
        });
        const res = await fetch(tokenEndpoint, {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body,
        });
        if (!res.ok) {
            console.warn(
                "[auth:refresh] token refresh failed:",
                res.status,
                (await res.text()).slice(0, 200),
            );
            return {...token, error: "RefreshAccessTokenError"};
        }
        const data = (await res.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
        };
        if (typeof data.access_token !== "string") {
            console.warn("[auth:refresh] response missing access_token");
            return {...token, error: "RefreshAccessTokenError"};
        }
        const refreshed: JWT = {
            ...token,
            access_token: data.access_token,
            // IdPs may rotate refresh tokens on refresh; some don't —
            // keep the old one if the response omits a replacement.
            refresh_token: data.refresh_token ?? token.refresh_token,
            expires_at:
                typeof data.expires_in === "number"
                    ? Math.floor(Date.now() / 1000) + data.expires_in
                    : undefined,
        };
        delete refreshed.error;
        return refreshed;
    } catch (err) {
        console.warn("[auth:refresh] network error during refresh:", err);
        return {...token, error: "RefreshAccessTokenError"};
    }
}

const devProvider = Credentials({
    id: "dev",
    name: "Dev Login",
    credentials: {},
    async authorize() {
        return {id: "dev-user", name: "Dev User", email: "dev@localhost"};
    },
});

const oauthProvider = GenericOAuthProvider({
    clientId: process.env.OAUTH_CLIENT_ID ?? "",
    clientSecret: process.env.OAUTH_CLIENT_SECRET ?? "",
    issuer: process.env.OAUTH_ISSUER,
    authorizationUrl: process.env.OAUTH_AUTHORIZATION_URL,
    tokenUrl: process.env.OAUTH_TOKEN_URL,
    userinfoUrl: process.env.OAUTH_USERINFO_URL,
    scope: process.env.OAUTH_SCOPE,
});

const config: NextAuthConfig = {
    providers: isDevBypass ? [devProvider] : [oauthProvider],

    pages: {
        signIn: "/login",
    },

    callbacks: {
        async signIn() {
            return true;
        },

        /**
         * Persist the OAuth access_token in the JWT (server-side only).
         *
         * Three call sites to handle:
         *   1. Initial sign-in (``account`` present): store the OAuth
         *      grant verbatim, including ``refresh_token`` + ``expires_at``
         *      so we can refresh later.
         *   2. Subsequent calls while the access token is fresh: return
         *      the JWT untouched — cheap, no IdP round-trip.
         *   3. Subsequent calls after ``access_token`` has expired: call
         *      the IdP's token endpoint with ``grant_type=refresh_token``
         *      and swap in the new access token.  On refresh failure we
         *      mark the JWT with ``error`` so the session surfaces it
         *      and Server Actions can force a fresh login.
         */
        async jwt({token, account}) {
            if (account) {
                if (isDevBypass) {
                    token.access_token = "dev-token";
                    return token;
                }
                token.access_token = (
                    account.access_token ??
                    ((account as Record<string, unknown>).accessToken as string | undefined)
                );
                token.refresh_token = (
                    account.refresh_token ??
                    ((account as Record<string, unknown>).refreshToken as string | undefined)
                );
                token.expires_at = resolveExpiresAt(account);
                delete token.error;
                return token;
            }

            if (isDevBypass) return token;
            if (!isAccessTokenExpired(token.expires_at)) return token;
            if (token.refresh_token === undefined) {
                // No refresh token was issued at sign-in (some grant
                // types don't) — mark the session errored so the next
                // Server Action forces a fresh login.
                token.error = "RefreshAccessTokenError";
                return token;
            }
            return await refreshAccessToken(token);
        },

        /**
         * Expose fields to the session.
         * accessToken is available for Server Actions (server-side only) —
         * they proxy it to the backend as a Bearer token.
         *
         * The ``refresh_token`` is deliberately NOT exposed — only the
         * ``access_token`` leaves the JWT, and even it stays on the server.
         */
        async session({session, token}) {
            session.accessToken = token.access_token;
            if (token.error !== undefined) session.error = token.error;
            return session;
        },

        async redirect({url, baseUrl}) {
            if (url.startsWith("/")) return `${baseUrl}${url}`;
            if (new URL(url).origin === baseUrl) return url;
            return baseUrl;
        },
    },

    session: {
        strategy: "jwt",
    },
};

export const {handlers, auth, signIn, signOut} = NextAuth(config);
