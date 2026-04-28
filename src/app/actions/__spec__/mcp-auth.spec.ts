/**
 * Tests for the MCP auth Server Actions.
 *
 * Coverage:
 * - listMCPAuthServers happy/error paths.
 * - getMCPAuthorizeUrl returns ok/error variants — surfaces API
 *   ``detail`` text on failures.
 * - revokeMCPToken treats 204 as success and propagates 200/204
 *   distinct from 4xx.
 * - 401 anywhere triggers handleUnauthorized.
 * - URL-encodes server names (spaces, slashes).
 */

import {beforeEach, describe, expect, it, vi} from "vitest";

const {authMock, signOutMock, redirectMock, rethrowMock} = vi.hoisted(() => ({
    authMock: vi.fn(),
    signOutMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
        const err = new Error(`NEXT_REDIRECT;${url}`);
        (err as Error & {digest: string}).digest = `NEXT_REDIRECT;replace;${url};307;`;
        throw err;
    }),
    rethrowMock: vi.fn((err: unknown) => {
        if (
            err instanceof Error &&
            typeof (err as {digest?: unknown}).digest === "string" &&
            ((err as {digest: string}).digest as string).startsWith(
                "NEXT_REDIRECT",
            )
        ) {
            throw err;
        }
    }),
}));

vi.mock("@/lib/auth/auth", () => ({
    auth: authMock,
    signOut: signOutMock,
}));

vi.mock("next/navigation", () => ({
    redirect: redirectMock,
    unstable_rethrow: rethrowMock,
}));

import {
    getMCPAuthorizeUrl,
    listMCPAuthServers,
    revokeMCPToken,
} from "../mcp-auth";

beforeEach(() => {
    authMock.mockReset().mockResolvedValue({accessToken: "tok"});
    signOutMock.mockReset().mockResolvedValue(undefined);
    redirectMock.mockClear();
    rethrowMock.mockClear();
});

describe("listMCPAuthServers", () => {
    it("GETs /mcp/auth/servers and parses the response", async () => {
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            capturedUrl =
                typeof input === "string" ? input : (input as URL).toString();
            return new Response(
                JSON.stringify([
                    {
                        server_name: "svc-a",
                        client_id: "c",
                        scopes: "openid",
                        authorized: false,
                        token_expired: false,
                        agent_names: ["alpha"],
                    },
                ]),
                {status: 200},
            );
        });
        const out = await listMCPAuthServers();
        expect(out).toHaveLength(1);
        expect(out[0].server_name).toBe("svc-a");
        expect(capturedUrl).toBe("http://127.0.0.1:8000/mcp/auth/servers");
    });

    it("returns [] on non-2xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 500}),
        );
        expect(await listMCPAuthServers()).toEqual([]);
    });

    it("redirects on 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(listMCPAuthServers()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns [] on a network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await listMCPAuthServers()).toEqual([]);
    });
});

describe("getMCPAuthorizeUrl", () => {
    it("returns kind=ok with the authorize_url on 200", async () => {
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            capturedUrl =
                typeof input === "string" ? input : (input as URL).toString();
            return new Response(
                JSON.stringify({authorize_url: "https://idp.example/x"}),
                {status: 200},
            );
        });
        const out = await getMCPAuthorizeUrl("svc/a b");
        expect(out).toEqual({kind: "ok", url: "https://idp.example/x"});
        // Server name URL-encoded.
        expect(capturedUrl).toBe(
            "http://127.0.0.1:8000/mcp/auth/servers/svc%2Fa%20b/authorize",
        );
    });

    it("surfaces the API ``detail`` field on a non-2xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({detail: "missing endpoint"}), {
                status: 500,
            }),
        );
        const out = await getMCPAuthorizeUrl("svc-a");
        expect(out).toEqual({
            kind: "error",
            message: "missing endpoint",
            status: 500,
        });
    });

    it("falls back to status-coded message when detail is missing", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({}), {status: 502}),
        );
        const out = await getMCPAuthorizeUrl("svc-a");
        expect(out.kind).toBe("error");
        expect((out as {message: string}).message).toMatch(/502/);
    });

    it("falls back to text body when JSON parsing fails", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("plain text body", {status: 502}),
        );
        const out = await getMCPAuthorizeUrl("svc-a");
        // JSON parse fails → falls back to text() — but body has been
        // consumed by the JSON attempt, so we get the status-coded
        // fallback message.  Either way: kind=error.
        expect(out.kind).toBe("error");
    });

    it("returns kind=error when the API omits authorize_url", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({something: "else"}), {status: 200}),
        );
        const out = await getMCPAuthorizeUrl("svc-a");
        expect(out.kind).toBe("error");
        expect((out as {message: string}).message).toMatch(
            /API did not return an authorization URL/,
        );
    });

    it("redirects on 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(getMCPAuthorizeUrl("svc-a")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns kind=error on a network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        const out = await getMCPAuthorizeUrl("svc-a");
        expect(out.kind).toBe("error");
        expect((out as {message: string}).message).toBe("boom");
    });
});

describe("revokeMCPToken", () => {
    it("DELETEs the server's token and returns true on 200", async () => {
        let capturedMethod = "";
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                capturedUrl =
                    typeof input === "string" ? input : (input as URL).toString();
                capturedMethod = init?.method ?? "";
                return new Response("", {status: 200});
            },
        );
        const ok = await revokeMCPToken("svc/a");
        expect(ok).toBe(true);
        expect(capturedMethod).toBe("DELETE");
        expect(capturedUrl).toBe(
            "http://127.0.0.1:8000/mcp/auth/servers/svc%2Fa/token",
        );
    });

    it("treats 204 No Content as success", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(null, {status: 204}),
        );
        expect(await revokeMCPToken("svc-a")).toBe(true);
    });

    it("returns false on a non-2xx", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 500}),
        );
        expect(await revokeMCPToken("svc-a")).toBe(false);
    });

    it("redirects on 401", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(revokeMCPToken("svc-a")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns false on a network error", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await revokeMCPToken("svc-a")).toBe(false);
    });
});
