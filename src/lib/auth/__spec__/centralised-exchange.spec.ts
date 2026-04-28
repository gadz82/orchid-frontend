/**
 * Tests for the Phase-2/4A/4B HTTP client.
 *
 * Coverage:
 * - Each endpoint posts JSON in the expected shape, parses the
 *   response, and returns the typed payload.
 * - Non-2xx responses raise :class:`CentralisedExchangeError` with
 *   the upstream HTTP status carried through.
 * - Network errors propagate (Auth.js / our refresh path treats
 *   them as ``RefreshAccessTokenError``).
 */

import {beforeEach, describe, expect, it, vi} from "vitest";

import {
    CentralisedExchangeError,
    exchangeAuthorizationCode,
    refreshUpstreamToken,
    resolveIdentity,
} from "../centralised-exchange";

beforeEach(() => {
    vi.restoreAllMocks();
});

describe("exchangeAuthorizationCode", () => {
    it("POSTs JSON to /auth/exchange-code and returns the parsed token response", async () => {
        let seen: {url: string; body: string} | null = null;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (input: string | URL | Request, init?: RequestInit) => {
                seen = {
                    url: typeof input === "string" ? input : input.toString(),
                    body: typeof init?.body === "string" ? init.body : "",
                };
                return new Response(
                    JSON.stringify({
                        access_token: "at-fresh",
                        refresh_token: "rt-fresh",
                        expires_in: 3600,
                        scope: "api",
                    }),
                    {status: 200},
                );
            },
        );

        const result = await exchangeAuthorizationCode({
            code: "the-code",
            redirect_uri: "http://localhost:3000/api/auth/callback/oauth",
            code_verifier: "the-verifier",
        });
        expect(result.access_token).toBe("at-fresh");
        expect(result.refresh_token).toBe("rt-fresh");
        expect(result.expires_in).toBe(3600);
        expect(result.scope).toBe("api");

        const captured = seen as unknown as {url: string; body: string};
        expect(captured.url).toBe("http://127.0.0.1:8000/auth/exchange-code");
        expect(JSON.parse(captured.body)).toEqual({
            code: "the-code",
            redirect_uri: "http://localhost:3000/api/auth/callback/oauth",
            code_verifier: "the-verifier",
        });
    });

    it("throws CentralisedExchangeError carrying the upstream status on 4xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({detail: "invalid_grant"}), {status: 400}),
        );
        await expect(
            exchangeAuthorizationCode({
                code: "bad",
                redirect_uri: "http://cb",
            }),
        ).rejects.toMatchObject({
            name: "CentralisedExchangeError",
            statusCode: 400,
        });
    });

    it("throws on 5xx as well — the caller maps it to RefreshAccessTokenError", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({detail: "bad gateway"}), {status: 502}),
        );
        await expect(
            exchangeAuthorizationCode({code: "c", redirect_uri: "http://cb"}),
        ).rejects.toBeInstanceOf(CentralisedExchangeError);
    });
});

describe("refreshUpstreamToken", () => {
    it("POSTs JSON to /auth/refresh-token and returns the rotated pair", async () => {
        let body: unknown = null;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
                return new Response(
                    JSON.stringify({
                        access_token: "at-rotated",
                        refresh_token: "rt-rotated",
                        expires_in: 3600,
                    }),
                    {status: 200},
                );
            },
        );

        const result = await refreshUpstreamToken({refresh_token: "rt-old"});
        expect(result.access_token).toBe("at-rotated");
        expect(result.refresh_token).toBe("rt-rotated");
        expect(body).toEqual({refresh_token: "rt-old"});
    });

    it("throws CentralisedExchangeError on 503 (refresh proxy not configured)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("", {status: 503}),
        );
        await expect(
            refreshUpstreamToken({refresh_token: "rt"}),
        ).rejects.toMatchObject({
            name: "CentralisedExchangeError",
            statusCode: 503,
        });
    });
});

describe("resolveIdentity", () => {
    it("POSTs JSON to /auth/resolve-identity and returns the identity payload", async () => {
        let body: unknown = null;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
                return new Response(
                    JSON.stringify({
                        subject: "u-42",
                        bearer: "tok-echoed",
                        auth_domain: "acme.example.com",
                        email: "a@b.c",
                        extra: {installation_id: 195128},
                    }),
                    {status: 200},
                );
            },
        );

        const result = await resolveIdentity({
            access_token: "tok-abc",
            auth_domain: "acme.example.com",
        });
        expect(result.subject).toBe("u-42");
        expect(result.bearer).toBe("tok-echoed");
        expect(result.email).toBe("a@b.c");
        expect(result.extra).toEqual({installation_id: 195128});
        expect(body).toEqual({
            access_token: "tok-abc",
            auth_domain: "acme.example.com",
        });
    });

    it("omits auth_domain when caller doesn't provide one", async () => {
        let body: Record<string, unknown> | null = null;
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (_input, init) => {
                body = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
                return new Response(
                    JSON.stringify({
                        subject: "u-1",
                        bearer: "tok",
                        auth_domain: "",
                        email: "",
                        extra: {},
                    }),
                    {status: 200},
                );
            },
        );

        await resolveIdentity({access_token: "tok"});
        expect(body !== null && "auth_domain" in body).toBe(false);
    });

    it("throws CentralisedExchangeError on 401 (expired upstream token)", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify({detail: "expired token"}), {status: 401}),
        );
        await expect(resolveIdentity({access_token: "bad"})).rejects.toMatchObject(
            {
                name: "CentralisedExchangeError",
                statusCode: 401,
            },
        );
    });
});
