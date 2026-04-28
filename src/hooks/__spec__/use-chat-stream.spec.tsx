/**
 * Tests for the SSE streaming hook.
 *
 * Coverage:
 * - Each SSE event-type fans out to the right callback
 *   (token, status, done, agent_result, handoff, error).
 * - Multipart body carries ``message`` + every file.
 * - HTTP error response triggers ``onError`` with status code in message.
 * - Missing response body triggers ``onError``.
 * - Malformed SSE chunks are silently skipped.
 * - AbortError on cancel is silently swallowed (no callback fires).
 * - Network errors surface to ``onError``.
 */

import {act, renderHook} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const {getStreamConfigMock} = vi.hoisted(() => ({
    getStreamConfigMock: vi.fn(),
}));

vi.mock("@/app/actions/stream", () => ({
    getStreamConfig: getStreamConfigMock,
}));

import {useChatStream, type StreamCallbacks} from "../use-chat-stream";

function mkCallbacks(overrides: Partial<StreamCallbacks> = {}): StreamCallbacks {
    return {
        onToken: vi.fn(),
        onStatus: vi.fn(),
        onAgentResult: vi.fn(),
        onHandoff: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        ...overrides,
    };
}

function bodyFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const c of chunks) controller.enqueue(encoder.encode(c));
            controller.close();
        },
    });
}

beforeEach(() => {
    getStreamConfigMock.mockReset().mockResolvedValue({
        url: "http://api.test",
        headers: {Authorization: "Bearer t"},
        streamingEnabled: true,
    });
});

describe("useChatStream — happy path", () => {
    it("dispatches each SSE event-type to the right callback", async () => {
        const sse = [
            'data: {"type":"token","content":"hel"}\n\n',
            'data: {"type":"token","content":"lo"}\n\n',
            'data: {"type":"status","agent":"alpha","status":"started"}\n\n',
            'data: {"type":"agent_result","agent":"alpha","content":"r1"}\n\n',
            'data: {"type":"handoff","content":"to beta"}\n\n',
            'data: {"type":"done","response":"hello world","agents_used":["alpha"],"auth_required":[]}\n\n',
        ];
        const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(bodyFromChunks(sse), {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "hi", null, cb);
        });

        expect(cb.onToken).toHaveBeenNthCalledWith(1, "hel");
        expect(cb.onToken).toHaveBeenNthCalledWith(2, "lo");
        expect(cb.onStatus).toHaveBeenCalledWith("alpha", "started", undefined);
        expect(cb.onAgentResult).toHaveBeenCalledWith("alpha", "r1");
        expect(cb.onHandoff).toHaveBeenCalledWith("to beta");
        expect(cb.onDone).toHaveBeenCalledWith("hello world", ["alpha"], []);
        expect(cb.onError).not.toHaveBeenCalled();

        expect(fetchSpy).toHaveBeenCalledWith(
            "http://api.test/chats/c1/messages/stream",
            expect.objectContaining({
                method: "POST",
                headers: {Authorization: "Bearer t"},
            }),
        );
    });

    it("appends every File to the multipart body", async () => {
        let captured: FormData | null = null;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                captured = init?.body as FormData;
                return new Response(
                    bodyFromChunks([
                        'data: {"type":"done","response":"ok","agents_used":[]}\n\n',
                    ]),
                    {status: 200},
                );
            },
        );

        const {result} = renderHook(() => useChatStream());
        const a = new File(["a"], "a.pdf", {type: "application/pdf"});
        const b = new File(["b"], "b.pdf", {type: "application/pdf"});
        await act(async () => {
            await result.current.streamMessage("c1", "go", [a, b], mkCallbacks());
        });

        expect(captured).not.toBeNull();
        const fd = captured as unknown as FormData;
        expect(fd.get("message")).toBe("go");
        expect(fd.getAll("files")).toEqual([a, b]);
    });

    it("emits a status event with preview when present", async () => {
        const sse = [
            'data: {"type":"status","agent":"alpha","status":"done","preview":"summary"}\n\n',
        ];
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(bodyFromChunks(sse), {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onStatus).toHaveBeenCalledWith("alpha", "done", "summary");
    });
});

describe("useChatStream — error paths", () => {
    it("surfaces an API error response via onError", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("nope", {status: 500}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });

        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect((cb.onError as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(
            /API error 500/,
        );
    });

    it("calls onError when the response body is missing", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            // ``new Response(null)`` produces a body-less Response.
            new Response(null, {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onError).toHaveBeenCalledWith("No response body");
    });

    it("emits an SSE error event via onError", async () => {
        const sse = ['data: {"type":"error","message":"agent crashed"}\n\n'];
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(bodyFromChunks(sse), {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onError).toHaveBeenCalledWith("agent crashed");
    });

    it("silently skips malformed SSE events", async () => {
        const sse = [
            "data: not-json\n\n",
            'data: {"type":"token","content":"survived"}\n\n',
        ];
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(bodyFromChunks(sse), {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onToken).toHaveBeenCalledWith("survived");
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("ignores lines that don't start with the SSE data: prefix", async () => {
        const sse = ["event: ping\n\n", "retry: 5000\n\n"];
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(bodyFromChunks(sse), {status: 200}),
        );
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        // Nothing fired — they don't start with ``data:`` and are skipped.
        expect(cb.onToken).not.toHaveBeenCalled();
        expect(cb.onStatus).not.toHaveBeenCalled();
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("surfaces unexpected network errors via onError", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNRESET"));
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect((cb.onError as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(
            /Stream error: ECONNRESET/,
        );
    });

    it("swallows AbortError when a stream is cancelled", async () => {
        const abortErr = new Error("aborted");
        abortErr.name = "AbortError";
        vi.spyOn(globalThis, "fetch").mockRejectedValue(abortErr);
        const cb = mkCallbacks();

        const {result} = renderHook(() => useChatStream());
        await act(async () => {
            await result.current.streamMessage("c1", "x", null, cb);
        });
        expect(cb.onError).not.toHaveBeenCalled();
    });
});

describe("useChatStream — cancelStream", () => {
    it("aborts the in-flight fetch when cancelStream() is called", async () => {
        let abortSignal: AbortSignal | undefined;
        // The stream rejects with an AbortError once the signal fires —
        // matching how undici / browser fetch behave under abort.
        vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
            abortSignal = init?.signal as AbortSignal;
            return new Promise((_resolve, reject) => {
                abortSignal!.addEventListener("abort", () => {
                    const err = new Error("aborted");
                    err.name = "AbortError";
                    reject(err);
                });
            }) as Promise<Response>;
        });

        const cb = mkCallbacks();
        const {result} = renderHook(() => useChatStream());

        let pending: Promise<void> | undefined;
        act(() => {
            pending = result.current.streamMessage("c1", "x", null, cb);
        });

        // Let the hook reach the fetch() call.
        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            result.current.cancelStream();
        });

        await pending;

        expect(abortSignal?.aborted).toBe(true);
        // ``swallows AbortError`` semantics — no error callback fires.
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it("aborts a previous stream when a new one starts", async () => {
        const signals: AbortSignal[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
            signals.push(init?.signal as AbortSignal);
            // First call: hang until aborted.
            // Second call: respond immediately so the test can finish.
            if (signals.length === 1) {
                return new Promise((_resolve, reject) => {
                    (init?.signal as AbortSignal).addEventListener(
                        "abort",
                        () => {
                            const err = new Error("aborted");
                            err.name = "AbortError";
                            reject(err);
                        },
                    );
                }) as Promise<Response>;
            }
            return Promise.resolve(
                new Response(
                    bodyFromChunks([
                        'data: {"type":"done","response":"ok","agents_used":[]}\n\n',
                    ]),
                    {status: 200},
                ),
            );
        });

        const cb = mkCallbacks();
        const {result} = renderHook(() => useChatStream());

        let first: Promise<void> | undefined;
        act(() => {
            first = result.current.streamMessage("c1", "x", null, cb);
        });
        await act(async () => {
            await Promise.resolve();
        });

        // Start a second stream — should abort the first one.
        await act(async () => {
            await result.current.streamMessage("c2", "y", null, cb);
        });
        await first;

        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
        expect(cb.onDone).toHaveBeenCalled();
    });
});
