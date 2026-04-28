/**
 * Tests for chat CRUD + messaging Server Actions.
 *
 * Coverage:
 * - Each happy path POSTs / GETs / DELETEs the right endpoint with the
 *   bearer header from the session.
 * - 401 responses trigger ``handleUnauthorized`` (signOut + redirect).
 * - Non-2xx responses produce sensible fallbacks (empty arrays, null,
 *   error payload on the message-send action).
 * - sendChatMessage builds multipart from the provided FormData,
 *   does NOT add Content-Type, and surfaces ``authRequired`` from the
 *   API response.
 * - Missing session on sendChatMessage returns the canned
 *   "Not authenticated" payload without hitting the network.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";

const {authMock, signOutMock, redirectMock, rethrowMock} = vi.hoisted(() => ({
    authMock: vi.fn(),
    signOutMock: vi.fn(),
    redirectMock: vi.fn((url: string) => {
        const err = new Error(`NEXT_REDIRECT;${url}`);
        // Mark with the digest so unstable_rethrow recognises it.
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
    createChat,
    deleteChat,
    listChats,
    loadMessages,
    sendChatMessage,
    shareChat,
} from "../chats";

const API = "http://127.0.0.1:8000";

beforeEach(() => {
    authMock.mockReset();
    signOutMock.mockReset().mockResolvedValue(undefined);
    redirectMock.mockClear();
    rethrowMock.mockClear();
});

function withSession() {
    authMock.mockResolvedValue({accessToken: "tok-abc"});
}

function expectAuthHeader(init: RequestInit | undefined) {
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-abc");
}

describe("createChat", () => {
    it("POSTs JSON to /chats with the title", async () => {
        withSession();
        let capturedUrl = "";
        let capturedInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                capturedUrl =
                    typeof input === "string" ? input : (input as URL).toString();
                capturedInit = init;
                return new Response(
                    JSON.stringify({
                        id: "c1",
                        title: "hello",
                        created_at: "x",
                        updated_at: "y",
                        is_shared: false,
                    }),
                    {status: 200},
                );
            },
        );

        const out = await createChat("hello");
        expect(out?.id).toBe("c1");
        expect(capturedUrl).toBe(`${API}/chats`);
        expect((capturedInit?.headers as Record<string, string>)["Content-Type"])
            .toBe("application/json");
        expectAuthHeader(capturedInit);
        expect(JSON.parse(capturedInit?.body as string)).toEqual({title: "hello"});
    });

    it("returns null on a non-2xx response", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", {status: 500}),
        );
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await createChat()).toBeNull();
        spy.mockRestore();
    });

    it("redirects to /login on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", {status: 401}),
        );
        await expect(createChat()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
        expect(signOutMock).toHaveBeenCalled();
    });

    it("returns null when fetch throws a non-redirect error", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(await createChat()).toBeNull();
        spy.mockRestore();
    });
});

describe("listChats", () => {
    it("GETs /chats and returns the parsed array", async () => {
        withSession();
        const items = [{id: "a"}, {id: "b"}];
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify(items), {status: 200}),
        );
        const out = await listChats();
        expect(out).toEqual(items);
    });

    it("returns an empty array on a non-2xx response", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("err", {status: 500}),
        );
        expect(await listChats()).toEqual([]);
    });

    it("redirects on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(listChats()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns an empty array on a network error", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await listChats()).toEqual([]);
    });
});

describe("loadMessages", () => {
    it("GETs /chats/{id}/messages", async () => {
        withSession();
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            capturedUrl =
                typeof input === "string" ? input : (input as URL).toString();
            return new Response(
                JSON.stringify([
                    {
                        id: "m1",
                        role: "user",
                        content: "hi",
                        agents_used: [],
                        created_at: "x",
                    },
                ]),
                {status: 200},
            );
        });
        const out = await loadMessages("chat-99");
        expect(capturedUrl).toBe(`${API}/chats/chat-99/messages`);
        expect(out).toHaveLength(1);
    });

    it("returns an empty array on non-2xx", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 404}),
        );
        expect(await loadMessages("c")).toEqual([]);
    });

    it("redirects on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(loadMessages("c")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns an empty array on a network error", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await loadMessages("c")).toEqual([]);
    });
});

describe("deleteChat", () => {
    it("DELETEs the chat and returns true on 2xx", async () => {
        withSession();
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
        const ok = await deleteChat("c1");
        expect(ok).toBe(true);
        expect(capturedMethod).toBe("DELETE");
        expect(capturedUrl).toBe(`${API}/chats/c1`);
    });

    it("returns false on a non-2xx", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 500}),
        );
        expect(await deleteChat("c1")).toBe(false);
    });

    it("redirects on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(deleteChat("c")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns false on a network error", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await deleteChat("c")).toBe(false);
    });
});

describe("shareChat", () => {
    it("POSTs to /chats/{id}/share and returns true on 2xx", async () => {
        withSession();
        let capturedUrl = "";
        vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
            capturedUrl =
                typeof input === "string" ? input : (input as URL).toString();
            return new Response("", {status: 200});
        });
        expect(await shareChat("c1")).toBe(true);
        expect(capturedUrl).toBe(`${API}/chats/c1/share`);
    });

    it("returns false on non-2xx", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 500}),
        );
        expect(await shareChat("c1")).toBe(false);
    });

    it("redirects on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(shareChat("c")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns false on a network error", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        expect(await shareChat("c")).toBe(false);
    });
});

describe("sendChatMessage", () => {
    it("returns the canned 'Not authenticated' payload when there's no session", async () => {
        authMock.mockResolvedValue(null);
        const out = await sendChatMessage("c1", "hi");
        expect(out.error).toBe("Not authenticated");
        expect(out.response).toBe("");
        expect(out.agentsUsed).toEqual([]);
    });

    it("POSTs multipart with message + files, no Content-Type header", async () => {
        withSession();
        let capturedInit: RequestInit | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                capturedInit = init;
                return new Response(
                    JSON.stringify({
                        response: "hello back",
                        chat_id: "c1",
                        agents_used: ["a"],
                        auth_required: ["mcp-1"],
                    }),
                    {status: 200},
                );
            },
        );

        const fd = new FormData();
        fd.append("files", new File(["a"], "a.pdf", {type: "application/pdf"}));
        fd.append("files", new File(["b"], "b.pdf", {type: "application/pdf"}));

        const out = await sendChatMessage("c1", "hi", fd);

        expect(out.response).toBe("hello back");
        expect(out.chatId).toBe("c1");
        expect(out.agentsUsed).toEqual(["a"]);
        expect(out.authRequired).toEqual(["mcp-1"]);

        // No Content-Type header — browser must set the multipart boundary.
        const headers = capturedInit?.headers as Record<string, string>;
        expect(headers["Content-Type"]).toBeUndefined();
        expect(headers.Authorization).toBe("Bearer tok-abc");

        const body = capturedInit?.body as FormData;
        expect(body.get("message")).toBe("hi");
        expect(body.getAll("files")).toHaveLength(2);
    });

    it("sends without files when fileData is omitted", async () => {
        withSession();
        let body: FormData | null = null;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                body = init?.body as FormData;
                return new Response(
                    JSON.stringify({response: "ok", agents_used: []}),
                    {status: 200},
                );
            },
        );
        await sendChatMessage("c1", "hi");
        expect(body).not.toBeNull();
        const fd = body as unknown as FormData;
        expect(fd.get("message")).toBe("hi");
        expect(fd.getAll("files")).toEqual([]);
    });

    it("returns error when API responds non-2xx", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("server boom", {status: 500}),
        );
        const out = await sendChatMessage("c1", "hi");
        expect(out.error).toMatch(/API error 500/);
    });

    it("redirects on 401", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 401}),
        );
        await expect(sendChatMessage("c1", "hi")).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
    });

    it("returns a 'Network error' payload on fetch rejection", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
        const out = await sendChatMessage("c1", "hi");
        expect(out.error).toMatch(/Network error: ECONNRESET/);
    });

    it("falls back to the requested chatId when the API omits chat_id", async () => {
        withSession();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(
                JSON.stringify({response: "hi", agents_used: []}),
                {status: 200},
            ),
        );
        const out = await sendChatMessage("c-fallback", "go");
        expect(out.chatId).toBe("c-fallback");
        expect(out.authRequired).toEqual([]);
    });
});

describe("session.error === RefreshAccessTokenError", () => {
    it("forces a sign-out before the request is sent", async () => {
        authMock.mockResolvedValue({
            accessToken: "tok",
            error: "RefreshAccessTokenError",
        });
        // ``handleUnauthorized`` runs before any fetch happens.
        await expect(listChats()).rejects.toMatchObject({
            digest: expect.stringContaining("NEXT_REDIRECT"),
        });
        expect(signOutMock).toHaveBeenCalled();
    });
});
