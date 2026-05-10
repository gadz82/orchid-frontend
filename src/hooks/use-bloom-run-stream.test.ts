import {describe, expect, it} from "vitest";

import {streamReducer} from "./use-bloom-run-stream";

/**
 * Unit tests for the pure reducer driving ``useBloomRunStream``.
 *
 * The live ``EventSource`` integration is exercised end-to-end in the
 * dev environment; here we lock down the state machine the reducer
 * exposes so terminal-vs-error disambiguation can never regress.
 */

const baseEvent = {
    type: "bloom.run.queued",
    run_id: "r-1",
    occurred_at: "2026-05-07T07:00:00.000Z",
    payload: {trigger_id: "morning"},
};

describe("streamReducer", () => {
    it("starts idle and resets on demand", () => {
        const seeded = streamReducer(
            {events: [baseEvent], status: "open", error: null},
            {type: "reset"},
        );
        expect(seeded).toEqual({events: [], status: "idle", error: null});
    });

    it("transitions idle → connecting and clears any prior error", () => {
        const next = streamReducer(
            {events: [], status: "error", error: "boom"},
            {type: "connecting"},
        );
        expect(next).toEqual({events: [], status: "connecting", error: null});
    });

    it("appends events and flips to ``open`` on the first one", () => {
        const next = streamReducer(
            {events: [], status: "connecting", error: null},
            {type: "event", event: baseEvent},
        );
        expect(next.events).toHaveLength(1);
        expect(next.status).toBe("open");
    });

    it("flips to ``finished`` on the terminal event", () => {
        const finished = {
            ...baseEvent,
            type: "bloom.run.finished",
            payload: {status: "succeeded"},
        };
        const next = streamReducer(
            {events: [baseEvent], status: "open", error: null},
            {type: "event", event: finished},
        );
        expect(next.status).toBe("finished");
        expect(next.events).toHaveLength(2);
    });

    it("ignores ``error`` once the stream finished cleanly", () => {
        const finished = {events: [baseEvent], status: "finished" as const, error: null};
        const next = streamReducer(finished, {type: "error", error: "closed"});
        expect(next).toBe(finished);
    });

    it("records errors when the stream wasn't terminal yet", () => {
        const next = streamReducer(
            {events: [baseEvent], status: "open", error: null},
            {type: "error", error: "connection lost"},
        );
        expect(next.status).toBe("error");
        expect(next.error).toBe("connection lost");
        // Events buffer is preserved so the UI can keep showing the
        // history that arrived before the disconnect.
        expect(next.events).toEqual([baseEvent]);
    });
});
