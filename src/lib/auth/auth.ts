/**
 * NextAuth v5 configuration — fully centralised onto orchid-api.
 *
 * The frontend holds **no upstream OAuth secrets** and **no upstream-
 * specific config** beyond what it learns from orchid-api's
 * ``GET /auth-info`` at startup (Phases 1, 2, 4A, 4B of the
 * auth-centralisation roadmap — see
 * :file:`.knowledge/auth-centralisation.md`).
 *
 * Required env surface:
 *   - ``AGENTS_API_URL``       — where orchid-api lives (used for
 *                                 discovery + every secret-bearing call)
 *   - ``DEV_AUTH_BYPASS=true`` — toggle dev-mode credentials provider
 *                                 (skips OAuth entirely)
 *   - ``OAUTH_SCOPE``          — optional override for the discovered scope
 *
 * Removed env surface (Phase 5 — no longer accepted; Auth.js will not
 * read them):
 *   - ``OAUTH_ISSUER``
 *   - ``OAUTH_CLIENT_ID``
 *   - ``OAUTH_CLIENT_SECRET``
 *   - ``OAUTH_AUTHORIZATION_URL``
 *   - ``OAUTH_TOKEN_URL``
 *   - ``OAUTH_USERINFO_URL``
 *
 * Token proxy: the OAuth ``access_token`` is stored ONLY in the
 * server-side NextAuth JWT.  The browser session never receives the
 * raw token.  All API calls go through Server Actions that read the
 * JWT and proxy requests with the Bearer token.
 */

import NextAuth from "next-auth";
import type {NextAuthConfig} from "next-auth";
import type {JWT} from "@auth/core/jwt";
import Credentials from "next-auth/providers/credentials";
import GenericOAuthProvider from "./oauth-provider";
import {getCentralisedOAuthConfig} from "./discovery";
import {
    CentralisedExchangeError,
    refreshUpstreamToken,
} from "./centralised-exchange";

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
 * Refresh the OAuth access token via orchid-api's
 * ``/auth/refresh-token`` (Phase 4B).  No upstream IdP traffic
 * leaves the frontend.
 *
 * On success, returns an updated JWT with a new ``access_token``,
 * rotated ``refresh_token`` (if the upstream IdP issues one), and
 * an updated ``expires_at``.  On failure we mark the JWT with
 * ``error`` so the next call surfaces the issue via
 * ``session.error`` and the UI can force a sign-out.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
    if (token.refresh_token === undefined) {
        return {...token, error: "RefreshAccessTokenError"};
    }
    try {
        const data = await refreshUpstreamToken({
            refresh_token: token.refresh_token,
        });
        const refreshed: JWT = {
            ...token,
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? token.refresh_token,
            expires_at:
                typeof data.expires_in === "number"
                    ? Math.floor(Date.now() / 1000) + data.expires_in
                    : undefined,
        };
        delete refreshed.error;
        return refreshed;
    } catch (err) {
        if (err instanceof CentralisedExchangeError) {
            console.warn(
                `[auth:refresh] orchid-api /auth/refresh-token rejected (status=${String(err.statusCode)}): ${err.message}`,
            );
        } else {
            console.warn("[auth:refresh] network error during refresh:", err);
        }
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

async function buildConfig(): Promise<NextAuthConfig> {
    if (isDevBypass) {
        return {
            providers: [devProvider],
            pages: {signIn: "/login"},
            callbacks: {
                async signIn() {
                    return true;
                },
                async jwt({token, account}) {
                    if (account) {
                        token.access_token = "dev-token";
                        return token;
                    }
                    return token;
                },
                async session({session, token}) {
                    session.accessToken = token.access_token;
                    return session;
                },
                async redirect({url, baseUrl}) {
                    if (url.startsWith("/")) return `${baseUrl}${url}`;
                    if (new URL(url).origin === baseUrl) return url;
                    return baseUrl;
                },
            },
            session: {strategy: "jwt"},
        };
    }

    const oauth = await getCentralisedOAuthConfig();
    const oauthProvider = GenericOAuthProvider({
        clientId: oauth.client_id,
        // No client_secret on the frontend — orchid-api holds it.
        // Auth.js still requires the field on the provider config; an
        // empty string is fine because we override the token + userinfo
        // callbacks so Auth.js never sends it anywhere.
        clientSecret: "",
        issuer: oauth.issuer_url,
        authorizationUrl: oauth.authorization_endpoint,
        scope: process.env.OAUTH_SCOPE ?? oauth.scope,
        ...(oauth.auth_domain !== null && oauth.auth_domain !== undefined
            ? {authDomain: oauth.auth_domain}
            : {}),
    });

    const config: NextAuthConfig = {
        providers: [oauthProvider],

        pages: {signIn: "/login"},

        callbacks: {
            async signIn() {
                return true;
            },

            /**
             * Persist the OAuth access_token in the JWT (server-side only).
             *
             * Three call sites:
             *   1. Initial sign-in (``account`` present): store the
             *      OAuth grant verbatim, including ``refresh_token`` +
             *      ``expires_at`` so we can refresh later.
             *   2. Subsequent calls while the access token is fresh:
             *      return the JWT untouched — cheap, no IdP round-trip.
             *   3. Subsequent calls after ``access_token`` has expired:
             *      call :func:`refreshAccessToken` (orchid-api Phase 4B
             *      path) and swap in the new token.
             */
            async jwt({token, account}) {
                if (account) {
                    token.access_token = (
                        account.access_token ??
                        ((account as Record<string, unknown>).accessToken as
                            | string
                            | undefined)
                    );
                    token.refresh_token = (
                        account.refresh_token ??
                        ((account as Record<string, unknown>).refreshToken as
                            | string
                            | undefined)
                    );
                    token.expires_at = resolveExpiresAt(account);
                    delete token.error;
                    return token;
                }

                if (!isAccessTokenExpired(token.expires_at)) return token;
                if (token.refresh_token === undefined) {
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

        session: {strategy: "jwt"},
    };
    return config;
}

export const {handlers, auth, signIn, signOut} = NextAuth(buildConfig);
