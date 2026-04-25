/**
 * Tests for the Phase-1 discovery module.
 *
 * Coverage:
 * - First-call hits the network exactly once.
 * - Concurrent callers share the in-flight promise.
 * - Successful response is cached for subsequent calls.
 * - Non-2xx responses return ``null`` and DON'T poison the cache.
 * - Network errors return ``null`` and DON'T poison the cache.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {
    _resetAuthInfoCacheForTests,
    getAuthInfo,
    getCentralisedOAuthConfig,
} from "./discovery";

const FAKE_OAUTH = {
    issuer_url: "https://acme.example.com",
    authorization_endpoint: "https://acme.example.com/oauth2/authorize",
    token_endpoint: "https://acme.example.com/oauth2/token",
    client_id: "frontend-client",
    scope: "api",
    exchange_via_api: true,
    resolve_via_api: true,
    refresh_via_api: true,
};

const FAKE_AUTH_INFO = {
    dev_bypass: false,
    identity_resolver_configured: true,
    oauth: FAKE_OAUTH,
};

beforeEach(() => {
    _resetAuthInfoCacheForTests();
    vi.restoreAllMocks();
});

afterEach(() => {
    _resetAuthInfoCacheForTests();
});

describe("getAuthInfo", () => {
    it("fetches /auth-info and returns the parsed payload", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}),
        );
        const result = await getAuthInfo();
        expect(result).toEqual(FAKE_AUTH_INFO);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const url = fetchSpy.mock.calls[0]?.[0];
        expect(url).toBe("http://127.0.0.1:8000/auth-info");
    });

    it("caches a successful response across calls", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}),
        );
        const a = await getAuthInfo();
        const b = await getAuthInfo();
        const c = await getAuthInfo();
        expect(a).toEqual(FAKE_AUTH_INFO);
        expect(b).toBe(a);
        expect(c).toBe(a);
        // Despite three callers, we hit the network exactly once.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("shares the in-flight promise across concurrent callers", async () => {
        // A slow upstream — three concurrent calls should all share
        // the same fetch.  Without the in-flight singleton each
        // request would issue its own network request.
        let resolve!: (value: Response) => void;
        const slow = new Promise<Response>((r) => {
            resolve = r;
        });
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockReturnValue(slow as ReturnType<typeof fetch>);

        const a = getAuthInfo();
        const b = getAuthInfo();
        const c = getAuthInfo();
        resolve(new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}));

        await expect(a).resolves.toEqual(FAKE_AUTH_INFO);
        await expect(b).resolves.toEqual(FAKE_AUTH_INFO);
        await expect(c).resolves.toEqual(FAKE_AUTH_INFO);
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it("returns null on non-2xx and does NOT poison the cache", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
            // First call: orchid-api still booting, returns 503.
            .mockResolvedValueOnce(new Response("", {status: 503}))
            // Second call: orchid-api up; should re-issue the request
            // because the failure didn't poison the cache.
            .mockResolvedValueOnce(
                new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}),
            );

        const first = await getAuthInfo();
        expect(first).toBeNull();

        const second = await getAuthInfo();
        expect(second).toEqual(FAKE_AUTH_INFO);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("returns null on network error and does NOT poison the cache", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch")
            .mockRejectedValueOnce(new Error("ECONNREFUSED"))
            .mockResolvedValueOnce(
                new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}),
            );

        const first = await getAuthInfo();
        expect(first).toBeNull();

        const second = await getAuthInfo();
        expect(second).toEqual(FAKE_AUTH_INFO);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});

describe("getCentralisedOAuthConfig", () => {
    it("returns the oauth block when discovery is healthy and all flags are on", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(JSON.stringify(FAKE_AUTH_INFO), {status: 200}),
        );
        const oauth = await getCentralisedOAuthConfig();
        expect(oauth.client_id).toBe("frontend-client");
        expect(oauth.exchange_via_api).toBe(true);
        expect(oauth.resolve_via_api).toBe(true);
        expect(oauth.refresh_via_api).toBe(true);
    });

    it("throws when resolve_via_api is false", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ...FAKE_AUTH_INFO,
                    oauth: {...FAKE_OAUTH, resolve_via_api: false},
                }),
                {status: 200},
            ),
        );
        await expect(getCentralisedOAuthConfig()).rejects.toThrow(/false/);
    });

    it("throws when /auth-info is unreachable", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
            new Error("ECONNREFUSED"),
        );
        await expect(getCentralisedOAuthConfig()).rejects.toThrow(
            /unreachable/i,
        );
    });

    it("throws when /auth-info has no oauth block", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    dev_bypass: false,
                    identity_resolver_configured: false,
                    oauth: null,
                }),
                {status: 200},
            ),
        );
        await expect(getCentralisedOAuthConfig()).rejects.toThrow(
            /OrchidAuthConfigProvider/,
        );
    });

    it("throws when exchange_via_api is false", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ...FAKE_AUTH_INFO,
                    oauth: {...FAKE_OAUTH, exchange_via_api: false},
                }),
                {status: 200},
            ),
        );
        await expect(getCentralisedOAuthConfig()).rejects.toThrow(
            /exchange_via_api.*resolve_via_api.*refresh_via_api/,
        );
    });

    it("throws when refresh_via_api is false", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ...FAKE_AUTH_INFO,
                    oauth: {...FAKE_OAUTH, refresh_via_api: false},
                }),
                {status: 200},
            ),
        );
        await expect(getCentralisedOAuthConfig()).rejects.toThrow(
            /false/,
        );
    });
});
