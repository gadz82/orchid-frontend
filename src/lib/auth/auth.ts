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
import Credentials from "next-auth/providers/credentials";
import GenericOAuthProvider from "./oauth-provider";

const isDevBypass = process.env.DEV_AUTH_BYPASS === "true";

// Extend the built-in types
declare module "next-auth" {
    interface Session {
        accessToken?: string;
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
         */
        async jwt({token, account}) {
            if (account) {
                if (isDevBypass) {
                    token.access_token = "dev-token";
                } else {
                    token.access_token =
                        account.access_token ??
                        (account as Record<string, unknown>).accessToken as string | undefined;
                }
            }
            return token;
        },

        /**
         * Expose fields to the session.
         * accessToken is available for Server Actions (server-side only) —
         * they proxy it to the backend as a Bearer token.
         */
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

    session: {
        strategy: "jwt",
    },
};

export const {handlers, auth, signIn, signOut} = NextAuth(config);
