import {describe, expect, it, vi, beforeEach} from "vitest";

/**
 * Tests for the chat-events SSE proxy (Phase F2.5).
 *
 * Mirrors the per-run ``api/bloom/stream/[runId]/route.test.ts``
 * shape — same auth gate + bearer-attach + 4xx propagation +
 * AbortSignal forwarding contract.
 */

vi.mock("@/lib/auth/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/app/actions/_api-config", () => ({
    AGENTS_API_URL: "http://api.test",
}));

const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);

import {auth} from "@/lib/auth/auth";
import {GET} from "./route";

const authMock = vi.mocked(auth);

function makeRequest(): {request: Request; signal: AbortSignal} {
    const ctrl = new AbortController();
    const request = new Request("http://localhost/api/chat-events/C-1", {
        signal: ctrl.signal,
    });
    return {request, signal: ctrl.signal};
}

beforeEach(() => {
    fetchMock.mockReset();
    authMock.mockReset();
});

describe("GET /api/chat-events/[chatId]", () => {
    it("returns 401 when no session bearer is available", async () => {
        authMock.mockResolvedValue(null as never);
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({chatId: "C-1"}),
        });
        expect(res.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards bearer + SSE Accept to the upstream chat-events URL", async () => {
        authMock.mockResolvedValue({
            accessToken: "tok-abc",
            user: {},
        } as never);
        fetchMock.mockResolvedValue(
            new Response("event: chat.bloom.attached\ndata: {}\n\n", {
                status: 200,
                headers: {"content-type": "text/event-stream"},
            }),
        );
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({chatId: "C-1"}),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
        const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
        expect(calledUrl).toBe("http://api.test/chats/C-1/events/stream");
        const headers = new Headers(calledInit!.headers);
        expect(headers.get("authorization")).toBe("Bearer tok-abc");
        expect(headers.get("accept")).toBe("text/event-stream");
    });

    it("URL-encodes the chat id when forwarding upstream", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("data: ok\n\n", {status: 200}),
        );
        const {request} = makeRequest();
        await GET(request as never, {
            params: Promise.resolve({chatId: "C with spaces/and slash"}),
        });
        const [calledUrl] = fetchMock.mock.calls[0]!;
        expect(calledUrl).toBe(
            "http://api.test/chats/C%20with%20spaces%2Fand%20slash/events/stream",
        );
    });

    it("propagates upstream 404 verbatim (404-never-403 contract)", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("not found", {status: 404}),
        );
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({chatId: "missing-or-not-mine"}),
        });
        expect(res.status).toBe(404);
    });

    it("propagates upstream 503 (events runtime not configured)", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("event stream not configured", {status: 503}),
        );
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({chatId: "C-1"}),
        });
        expect(res.status).toBe(503);
    });

    it("forwards an AbortSignal to the upstream fetch", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("data: ok\n\n", {status: 200}),
        );
        const {request} = makeRequest();
        await GET(request as never, {
            params: Promise.resolve({chatId: "C-1"}),
        });
        const [, calledInit] = fetchMock.mock.calls[0]!;
        // ``Request`` copies the signal into a request-scoped wrapper,
        // so we check shape rather than identity.
        expect(calledInit?.signal).toBeInstanceOf(AbortSignal);
    });
});
