import {describe, expect, it} from "vitest";

import {chatEventsReducer} from "./use-chat-events";

/**
 * Reducer-level tests for ``useChatEvents``.  The live
 * ``EventSource`` integration is exercised end-to-end in the dev
 * environment; this file pins the state-machine semantics that
 * drive the in-chat progress card (Phase F2.5).
 */

const INITIAL = {blooms: new Map(), status: "idle" as const, error: null};

const attached = (run_id = "r-1", source_message_id: string | null = "m-1") => ({
    type: "chat.bloom.attached" as const,
    chat_id: "C-1",
    run_id,
    occurred_at: "2026-05-07T12:00:00.000Z",
    payload: {
        run_id,
        trigger_id: "deep-research",
        agent_name: "reviews",
        source_message_id,
        identity_mode: "act_as_user",
        attached_at: "2026-05-07T12:00:00.000Z",
    },
});

const tick = (run_id = "r-1", overrides: Record<string, unknown> = {}) => ({
    type: "chat.bloom.tick" as const,
    chat_id: "C-1",
    run_id,
    occurred_at: "2026-05-07T12:00:05.000Z",
    payload: {kind: "tool.called", tool: "search", ...overrides},
});

const finished = (
    run_id = "r-1",
    status: "succeeded" | "failed" = "succeeded",
) => ({
    type: "chat.bloom.finished" as const,
    chat_id: "C-1",
    run_id,
    occurred_at: "2026-05-07T12:01:00.000Z",
    payload: {
        run_id,
        status,
        finished_at: "2026-05-07T12:01:00.000Z",
        ...(status === "failed" ? {error: "boom"} : {}),
    },
});

describe("chatEventsReducer — lifecycle", () => {
    it("starts idle and accepts ``connecting`` to clear the map", () => {
        const after = chatEventsReducer(
            {
                blooms: new Map([["r-1", {} as never]]),
                status: "open",
                error: null,
            },
            {type: "connecting"},
        );
        expect(after.status).toBe("connecting");
        expect(after.blooms.size).toBe(0);
    });

    it("``open`` flips status without touching the map", () => {
        const seeded = {
            blooms: new Map([["r-1", {run_id: "r-1"} as never]]),
            status: "connecting" as const,
            error: null,
        };
        const after = chatEventsReducer(seeded, {type: "open"});
        expect(after.status).toBe("open");
        expect(after.blooms.size).toBe(1);
    });

    it("``reconnecting`` preserves entries (refresh on next discovery)", () => {
        const seeded = {
            blooms: new Map([["r-1", {run_id: "r-1"} as never]]),
            status: "open" as const,
            error: null,
        };
        const after = chatEventsReducer(seeded, {type: "reconnecting"});
        expect(after.status).toBe("reconnecting");
        expect(after.blooms.size).toBe(1);
    });

    it("``error`` carries the error message", () => {
        const after = chatEventsReducer(INITIAL, {
            type: "error",
            error: "bad event: SyntaxError",
        });
        expect(after.status).toBe("error");
        expect(after.error).toBe("bad event: SyntaxError");
    });
});

describe("chatEventsReducer — events", () => {
    it("``attached`` adds a new running row", () => {
        const after = chatEventsReducer(INITIAL, {
            type: "event",
            event: attached("r-1", "m-1"),
        });
        const row = after.blooms.get("r-1")!;
        expect(row.status).toBe("running");
        expect(row.trigger_id).toBe("deep-research");
        expect(row.source_message_id).toBe("m-1");
        expect(row.identity_mode).toBe("act_as_user");
        expect(row.ticks).toEqual([]);
    });

    it("``attached`` is idempotent on the same run id (queued+started collapse)", () => {
        const once = chatEventsReducer(INITIAL, {
            type: "event",
            event: attached(),
        });
        // Add a tick so the second attached can be checked for
        // tick-buffer preservation.
        const withTick = chatEventsReducer(once, {type: "event", event: tick()});
        const twice = chatEventsReducer(withTick, {
            type: "event",
            event: attached(),
        });
        expect(twice.blooms.size).toBe(1);
        expect(twice.blooms.get("r-1")!.ticks).toHaveLength(1);
    });

    it("``tick`` appends to the ticks buffer", () => {
        const a = chatEventsReducer(INITIAL, {type: "event", event: attached()});
        const b = chatEventsReducer(a, {type: "event", event: tick()});
        const c = chatEventsReducer(b, {type: "event", event: tick("r-1", {tool: "fetch"})});
        const row = c.blooms.get("r-1")!;
        expect(row.ticks).toHaveLength(2);
        expect(row.ticks[0]!.tool).toBe("search");
        expect(row.ticks[1]!.tool).toBe("fetch");
    });

    it("``tick`` enforces FIFO cap of 50 — oldest dropped on overflow", () => {
        let state: ReturnType<typeof chatEventsReducer> = chatEventsReducer(
            INITIAL,
            {type: "event", event: attached()},
        );
        for (let i = 0; i < 60; i++) {
            state = chatEventsReducer(state, {
                type: "event",
                event: tick("r-1", {message: `t${i}`}),
            });
        }
        const row = state.blooms.get("r-1")!;
        expect(row.ticks).toHaveLength(50);
        // Oldest 10 dropped — the survivors are t10..t59.
        expect(row.ticks[0]!.message).toBe("t10");
        expect(row.ticks[49]!.message).toBe("t59");
    });

    it("``tick`` arriving before attached synthesizes a stub row", () => {
        const after = chatEventsReducer(INITIAL, {
            type: "event",
            event: tick("r-orphan"),
        });
        const row = after.blooms.get("r-orphan")!;
        expect(row.status).toBe("running");
        expect(row.ticks).toHaveLength(1);
    });

    it("``finished`` (succeeded) flips status to ``finished``", () => {
        const a = chatEventsReducer(INITIAL, {type: "event", event: attached()});
        const b = chatEventsReducer(a, {type: "event", event: finished("r-1", "succeeded")});
        expect(b.blooms.get("r-1")!.status).toBe("finished");
    });

    it("``finished`` (failed) flips status to ``failed`` and carries error", () => {
        const a = chatEventsReducer(INITIAL, {type: "event", event: attached()});
        const b = chatEventsReducer(a, {type: "event", event: finished("r-1", "failed")});
        const row = b.blooms.get("r-1")!;
        expect(row.status).toBe("failed");
        expect(row.error).toBe("boom");
    });

    it("``finished`` arriving for an unknown run still surfaces it briefly", () => {
        const after = chatEventsReducer(INITIAL, {
            type: "event",
            event: finished("r-mystery", "succeeded"),
        });
        expect(after.blooms.get("r-mystery")!.status).toBe("finished");
    });
});

describe("chatEventsReducer — drop", () => {
    it("``drop`` removes a single run id from the map", () => {
        const seeded = chatEventsReducer(INITIAL, {
            type: "event",
            event: attached("r-1"),
        });
        const after = chatEventsReducer(seeded, {type: "drop", runId: "r-1"});
        expect(after.blooms.has("r-1")).toBe(false);
    });

    it("``drop`` is a no-op when the run id is absent", () => {
        const after = chatEventsReducer(INITIAL, {type: "drop", runId: "nope"});
        expect(after.blooms.size).toBe(0);
    });
});

describe("chatEventsReducer — reset", () => {
    it("``reset`` returns to INITIAL", () => {
        const seeded = chatEventsReducer(INITIAL, {
            type: "event",
            event: attached(),
        });
        const after = chatEventsReducer(seeded, {type: "reset"});
        expect(after.blooms.size).toBe(0);
        expect(after.status).toBe("idle");
        expect(after.error).toBeNull();
    });
});
