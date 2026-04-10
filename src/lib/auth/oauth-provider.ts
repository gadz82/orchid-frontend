/**
 * Generic OAuth2 / OpenID Connect provider for NextAuth v5.
 *
 * Industry-standard implementation that works with any OAuth2/OIDC server:
 *   - Keycloak, Auth0, Okta, Azure AD, Google, etc.
 *   - Supports OIDC auto-discovery via `issuer` (`.well-known/openid-configuration`)
 *   - OR explicit endpoint URLs for non-OIDC providers
 *
 * Environment variables:
 *   OAUTH_ISSUER            — OIDC issuer URL (enables auto-discovery)
 *   OAUTH_CLIENT_ID         — OAuth2 client ID
 *   OAUTH_CLIENT_SECRET     — OAuth2 client secret
 *   OAUTH_AUTHORIZATION_URL — (optional) explicit authorization endpoint
 *   OAUTH_TOKEN_URL         — (optional) explicit token endpoint
 *   OAUTH_USERINFO_URL      — (optional) explicit userinfo endpoint
 *   OAUTH_SCOPE             — (optional) space-separated scopes (default: "openid profile email")
 */

import type {OAuthConfig, OAuthUserConfig} from "next-auth/providers";

export interface OAuthProfile {
    /** Subject identifier (unique user ID from the IdP) */
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
    /** Any additional claims from the ID token or userinfo response */
    [key: string]: unknown;
}

export interface GenericOAuthProviderOptions extends OAuthUserConfig<OAuthProfile> {
    /** OIDC issuer URL — enables auto-discovery of endpoints */
    issuer?: string;
    /** Explicit authorization endpoint (overrides discovery) */
    authorizationUrl?: string;
    /** Explicit token endpoint (overrides discovery) */
    tokenUrl?: string;
    /** Explicit userinfo endpoint (overrides discovery) */
    userinfoUrl?: string;
    /** Space-separated scopes (default: "openid profile email") */
    scope?: string;
}

const sharedProfile = (profile: OAuthProfile) => ({
    id: profile.sub,
    name: profile.name ?? profile.sub,
    email: profile.email ?? "",
    image: profile.picture,
});

export default function GenericOAuthProvider(
    options: GenericOAuthProviderOptions
): OAuthConfig<OAuthProfile> {
    const scope = options.scope ?? "openid profile email";

    // OIDC auto-discovery mode — issuer URL drives endpoint resolution
    if (options.issuer) {
        return {
            id: "oauth",
            name: "OAuth",
            type: "oidc",
            issuer: options.issuer,
            clientId: options.clientId,
            clientSecret: options.clientSecret,
            checks: ["state", "pkce"],
            ...(scope !== "openid profile email" && {
                authorization: {params: {scope}},
            }),
            profile: sharedProfile,
            options,
        };
    }

    // Explicit endpoints mode — for non-OIDC / plain OAuth2 providers
    return {
        id: "oauth",
        name: "OAuth",
        type: "oauth",
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        checks: ["state", "pkce"],
        ...(options.authorizationUrl && {
            authorization: {
                url: options.authorizationUrl,
                params: {scope, response_type: "code"},
            },
        }),
        ...(options.tokenUrl && {token: options.tokenUrl}),
        ...(options.userinfoUrl && {userinfo: options.userinfoUrl}),
        profile: sharedProfile,
        options,
    } as OAuthConfig<OAuthProfile>;
}
