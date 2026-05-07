"use client";

/**
 * ``useBloomRunStream`` — live SSE subscription for one Bloom run
 * (Phase F2).
 *
 * Opens an ``EventSource`` against ``/api/bloom/stream/{runId}`` (the
 * same-origin proxy that resolves the NextAuth bearer server-side)
 * and accumulates ``BloomEvent``s into an in-memory buffer.  The
 * stream closes automatically after ``bloom.run.finished`` and is
 * NOT re-opened — terminal status is final.
 *
 * The hook exposes a ``status`` field separate from the run's job
 * status so the UI can distinguish:
 *
 * - ``connecting`` — EventSource opened, no event yet.
 * - ``open`` — at least one event received, stream still live.
 * - ``finished`` — terminal ``bloom.run.finished`` seen.
 * - ``error`` — connection error before any terminal event.
 * - ``idle`` — ``runId`` is ``null`` (no run selected) or ``stream``
 *   was disabled by the caller.
 *
 * Tests run with ``stream=false`` (or ``runId=null``) so the hook
 * stays inert under jsdom — the live path is exercised end-to-end
 * in the dev environment.
 */

import {useEffect, useReducer} from "react";

/** One server-sent event, parsed from the ``data:`` payload. */
export interface BloomStreamEvent {
    type: string;
    run_id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
}

export type BloomStreamStatus =
    | "idle"
    | "connecting"
    | "open"
    | "finished"
    | "error";

export interface UseBloomRunStreamResult {
    events: BloomStreamEvent[];
    status: BloomStreamStatus;
    /** The most recent event, useful for header-style displays. */
    lastEvent: BloomStreamEvent | null;
    /** Set when ``status === "error"``. */
    error: string | null;
}

type Action =
    | {type: "reset"}
    | {type: "connecting"}
    | {type: "event"; event: BloomStreamEvent}
    | {type: "error"; error: string};

interface State {
    events: BloomStreamEvent[];
    status: BloomStreamStatus;
    error: string | null;
}

const INITIAL: State = {events: [], status: "idle", error: null};

export function streamReducer(state: State, action: Action): State {
    switch (action.type) {
        case "reset":
            return INITIAL;
        case "connecting":
            return {events: [], status: "connecting", error: null};
        case "event": {
            const events = [...state.events, action.event];
            const isTerminal = action.event.type === "bloom.run.finished";
            return {
                events,
                status: isTerminal ? "finished" : "open",
                error: null,
            };
        }
        case "error":
            // If we already saw a terminal event we ignore the
            // close-as-error that EventSource raises after the
            // upstream stream ends — that's a clean shutdown.
            if (state.status === "finished") return state;
            return {events: state.events, status: "error", error: action.error};
        default:
            return state;
    }
}

export interface UseBloomRunStreamOptions {
    /** When false, the hook stays in ``idle`` and opens no socket.
     *  Default: true. */
    stream?: boolean;
}

export function useBloomRunStream(
    runId: string | null,
    options: UseBloomRunStreamOptions = {},
): UseBloomRunStreamResult {
    const stream = options.stream ?? true;
    const [state, dispatch] = useReducer(streamReducer, INITIAL);

    useEffect(() => {
        if (runId === null || !stream) {
            dispatch({type: "reset"});
            return;
        }
        if (typeof EventSource === "undefined") {
            // Test / SSR environments — stay idle.
            return;
        }
        dispatch({type: "connecting"});
        const es = new EventSource(
            `/api/bloom/stream/${encodeURIComponent(runId)}`,
        );

        const handle = (ev: MessageEvent) => {
            try {
                const parsed = JSON.parse(ev.data) as BloomStreamEvent;
                dispatch({type: "event", event: parsed});
            } catch (err) {
                dispatch({type: "error", error: `bad event: ${String(err)}`});
            }
        };

        // The orchid-api ``/runs/{id}/stream`` endpoint emits each
        // SSE frame with an explicit ``event:`` line, so we register
        // listeners for the four canonical types AND a generic
        // ``message`` fallback for any future event type.
        const types = [
            "bloom.signal.ingested",
            "bloom.run.queued",
            "bloom.run.started",
            "bloom.run.tick",
            "bloom.run.finished",
        ];
        for (const t of types) es.addEventListener(t, handle as EventListener);
        es.addEventListener("message", handle as EventListener);

        es.onerror = () => {
            // EventSource fires ``onerror`` both on real network
            // errors and on a clean upstream close; the reducer
            // disambiguates by checking whether we already saw the
            // terminal event.
            dispatch({type: "error", error: "connection lost"});
            es.close();
        };

        return () => {
            es.close();
        };
    }, [runId, stream]);

    return {
        events: state.events,
        status: state.status,
        lastEvent: state.events.length > 0 ? state.events[state.events.length - 1]! : null,
        error: state.error,
    };
}
