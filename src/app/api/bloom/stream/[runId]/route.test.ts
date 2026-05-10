import {describe, expect, it, vi, beforeEach} from "vitest";

/**
 * Tests for the SSE proxy route handler.
 *
 * The handler is a thin pipe between ``EventSource`` (client) and
 * ``orchid-api``'s ``/runs/{id}/stream`` endpoint, so the tests
 * focus on the auth + forwarding contract:
 *
 * - 401 when no session bearer is available.
 * - Forwards the bearer + ``Accept: text/event-stream`` header.
 * - Pipes the upstream body through unchanged.
 * - Surfaces upstream non-2xx as the same status to the client.
 */

vi.mock("@/lib/auth/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("@/app/actions/_api-config", () => ({
    AGENTS_API_URL: "http://api.test",
}));

const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);

// Import AFTER mocks so the handler picks them up.
import {auth} from "@/lib/auth/auth";
import {GET} from "./route";

const authMock = vi.mocked(auth);

function makeRequest(): {request: Request; signal: AbortSignal} {
    const ctrl = new AbortController();
    const request = new Request("http://localhost/api/bloom/stream/r-1", {
        signal: ctrl.signal,
    });
    return {request, signal: ctrl.signal};
}

beforeEach(() => {
    fetchMock.mockReset();
    authMock.mockReset();
});

describe("GET /api/bloom/stream/[runId]", () => {
    it("returns 401 when no session bearer is available", async () => {
        authMock.mockResolvedValue(null as never);
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({runId: "r-1"}),
        });
        expect(res.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards bearer + SSE Accept header to the upstream URL", async () => {
        authMock.mockResolvedValue({
            accessToken: "tok-abc",
            user: {},
        } as never);
        fetchMock.mockResolvedValue(
            new Response("data: ok\n\n", {
                status: 200,
                headers: {"content-type": "text/event-stream"},
            }),
        );
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({runId: "r-1"}),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

        const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
        expect(calledUrl).toBe("http://api.test/runs/r-1/stream");
        const headers = new Headers(calledInit!.headers);
        expect(headers.get("authorization")).toBe("Bearer tok-abc");
        expect(headers.get("accept")).toBe("text/event-stream");
    });

    it("URL-encodes the run id when forwarding upstream", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("data: ok\n\n", {status: 200}),
        );
        const {request} = makeRequest();
        await GET(request as never, {
            params: Promise.resolve({runId: "weird id/with slash"}),
        });
        const [calledUrl] = fetchMock.mock.calls[0]!;
        expect(calledUrl).toBe(
            "http://api.test/runs/weird%20id%2Fwith%20slash/stream",
        );
    });

    it("propagates upstream 404 as 404 to the client", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("not found", {status: 404}),
        );
        const {request} = makeRequest();
        const res = await GET(request as never, {
            params: Promise.resolve({runId: "missing"}),
        });
        expect(res.status).toBe(404);
    });

    it("forwards an AbortSignal to the upstream fetch", async () => {
        authMock.mockResolvedValue({accessToken: "t", user: {}} as never);
        fetchMock.mockResolvedValue(
            new Response("data: ok\n\n", {status: 200}),
        );
        const {request} = makeRequest();
        await GET(request as never, {
            params: Promise.resolve({runId: "r-1"}),
        });
        const [, calledInit] = fetchMock.mock.calls[0]!;
        // ``Request`` copies the supplied signal into a request-scoped
        // wrapper, so we can't compare identity — but the route MUST
        // forward an AbortSignal so client unmount cancels the
        // long-lived upstream connection.
        expect(calledInit?.signal).toBeInstanceOf(AbortSignal);
    });
});
