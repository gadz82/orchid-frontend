"use client";

/**
 * ``useChatEvents`` — long-lived SSE subscription for in-chat
 * Bloom progress (Phase F2.5).
 *
 * Opens an ``EventSource`` against the same-origin proxy
 * ``/api/chat-events/{chatId}`` and accumulates progress state in a
 * ``Map<run_id, BloomProgressState>`` keyed by run id.  The map is
 * the single source of truth the components render from.
 *
 * Three event types arrive on the wire (defined by Phase 4.5
 * ``ChatBloomEvent.type``):
 *
 * - ``chat.bloom.attached`` — adds (or refreshes) a row.  Fires on
 *   the upstream's ``queued`` AND ``started`` collapse — the second
 *   arrival is a no-op because the run id is already in the map.
 * - ``chat.bloom.tick`` — appends to the run's ``ticks`` buffer
 *   (capped FIFO at 50 entries; oldest dropped on overflow).
 * - ``chat.bloom.finished`` — flips ``status`` to ``finished`` /
 *   ``failed`` and schedules a 2 s grace deletion so the fade-out
 *   animation has time to play.
 *
 * Reconnect: the EventSource auto-reconnects on transient errors
 * (browser default), AND we explicitly reconnect after a manual
 * close.  Each reconnect re-runs the upstream's discovery pass,
 * so the map state rebuilds from the in-flight rows — no cursor /
 * since-id semantics required (Phase 4.5 §LS10).
 *
 * The hook is mounted alongside ``useChatStream`` in
 * ``<ChatContainer>`` — the two are independent: ``useChatStream``
 * is per-message, ``useChatEvents`` is per-chat-session.
 */

import {useEffect, useReducer, useRef} from "react";

const TICK_CAP = 50;
const FINISHED_GRACE_MS = 2000;

export type BloomChatStatus = "running" | "finished" | "failed";

export interface BloomTick {
    occurred_at: string;
    kind: string;
    agent?: string;
    tool?: string;
    status?: string;
    message?: string;
}

export interface BloomProgressState {
    run_id: string;
    trigger_id: string;
    agent_name: string;
    /** Anchor for the in-chat progress card (§LS5).  ``null`` when
     *  the binding was emitted from outside a chat turn — the
     *  frontend renders these in the bottom dock fallback. */
    source_message_id: string | null;
    /** Drives the cancel-button gating per §LS3.  ``act_as_user``
     *  shows it; ``addressed_to_user`` hides it. */
    identity_mode: "act_as_user" | "addressed_to_user" | null;
    attached_at: string;
    status: BloomChatStatus;
    ticks: BloomTick[];
    error: string | null;
}

export type ChatStreamStatus =
    | "idle"
    | "connecting"
    | "open"
    | "reconnecting"
    | "error";

export interface UseChatEventsResult {
    blooms: Map<string, BloomProgressState>;
    status: ChatStreamStatus;
    error: string | null;
}

// ── Wire-format event ───────────────────────────────────────


interface ChatBloomEventOnWire {
    type: "chat.bloom.attached" | "chat.bloom.tick" | "chat.bloom.finished";
    chat_id: string;
    run_id: string;
    occurred_at: string;
    payload: Record<string, unknown>;
}

// ── Reducer ─────────────────────────────────────────────────


type Action =
    | {type: "reset"}
    | {type: "connecting"}
    | {type: "open"}
    | {type: "reconnecting"}
    | {type: "error"; error: string}
    | {type: "event"; event: ChatBloomEventOnWire}
    | {type: "drop"; runId: string};

interface State {
    blooms: Map<string, BloomProgressState>;
    status: ChatStreamStatus;
    error: string | null;
}

const INITIAL: State = {blooms: new Map(), status: "idle", error: null};

export function chatEventsReducer(state: State, action: Action): State {
    switch (action.type) {
        case "reset":
            return INITIAL;
        case "connecting":
            return {blooms: new Map(), status: "connecting", error: null};
        case "open":
            return {blooms: state.blooms, status: "open", error: null};
        case "reconnecting":
            // Keep existing entries — discovery on reconnect refreshes them.
            return {blooms: state.blooms, status: "reconnecting", error: null};
        case "error":
            return {blooms: state.blooms, status: "error", error: action.error};
        case "event":
            return {
                blooms: applyEvent(state.blooms, action.event),
                status: "open",
                error: null,
            };
        case "drop": {
            const next = new Map(state.blooms);
            next.delete(action.runId);
            return {blooms: next, status: state.status, error: state.error};
        }
        default:
            return state;
    }
}

function applyEvent(
    blooms: Map<string, BloomProgressState>,
    event: ChatBloomEventOnWire,
): Map<string, BloomProgressState> {
    const next = new Map(blooms);
    const existing = next.get(event.run_id);

    switch (event.type) {
        case "chat.bloom.attached": {
            // Idempotent: if we already have the row, refresh its
            // metadata fields but preserve accumulated ticks.  The
            // upstream collapses queued+started into TWO attached
            // events for the same run id; this dedup makes that
            // a no-op on the second arrival.
            const base: BloomProgressState = {
                run_id: event.run_id,
                trigger_id: stringField(event.payload, "trigger_id") ?? "",
                agent_name: stringField(event.payload, "agent_name") ?? "",
                source_message_id: stringField(event.payload, "source_message_id"),
                identity_mode: identityField(event.payload),
                attached_at:
                    stringField(event.payload, "attached_at") ?? event.occurred_at,
                status: existing?.status ?? "running",
                ticks: existing?.ticks ?? [],
                error: existing?.error ?? null,
            };
            next.set(event.run_id, base);
            return next;
        }
        case "chat.bloom.tick": {
            if (existing === undefined) {
                // A tick arriving before attached is unusual but
                // harmless — synthesize a stub row from what the
                // tick carries so we don't drop the data.
                next.set(event.run_id, {
                    run_id: event.run_id,
                    trigger_id: stringField(event.payload, "trigger_id") ?? "",
                    agent_name: stringField(event.payload, "agent_name") ?? "",
                    source_message_id: stringField(event.payload, "source_message_id"),
                    identity_mode: identityField(event.payload),
                    attached_at: event.occurred_at,
                    status: "running",
                    ticks: [tickFromPayload(event)],
                    error: null,
                });
                return next;
            }
            const ticks = [...existing.ticks, tickFromPayload(event)];
            // FIFO cap — drop oldest on overflow.
            if (ticks.length > TICK_CAP) {
                ticks.splice(0, ticks.length - TICK_CAP);
            }
            next.set(event.run_id, {...existing, ticks});
            return next;
        }
        case "chat.bloom.finished": {
            if (existing === undefined) {
                // A finished event for a run we never saw start is
                // rare (reconnect race?) but we still surface it
                // briefly so the user sees the terminal status.
                const status: BloomChatStatus =
                    stringField(event.payload, "status") === "succeeded"
                        ? "finished"
                        : "failed";
                next.set(event.run_id, {
                    run_id: event.run_id,
                    trigger_id: stringField(event.payload, "trigger_id") ?? "",
                    agent_name: stringField(event.payload, "agent_name") ?? "",
                    source_message_id: stringField(event.payload, "source_message_id"),
                    identity_mode: identityField(event.payload),
                    attached_at: event.occurred_at,
                    status,
                    ticks: [],
                    error: stringField(event.payload, "error"),
                });
                return next;
            }
            const status: BloomChatStatus =
                stringField(event.payload, "status") === "succeeded"
                    ? "finished"
                    : "failed";
            next.set(event.run_id, {
                ...existing,
                status,
                error: stringField(event.payload, "error"),
            });
            return next;
        }
        default:
            return next;
    }
}

function stringField(p: Record<string, unknown>, key: string): string | null {
    const v = p[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

function identityField(
    p: Record<string, unknown>,
): "act_as_user" | "addressed_to_user" | null {
    const v = p["identity_mode"];
    if (v === "act_as_user" || v === "addressed_to_user") return v;
    return null;
}

function tickFromPayload(event: ChatBloomEventOnWire): BloomTick {
    const p = event.payload ?? {};
    return {
        occurred_at: event.occurred_at,
        kind: stringField(p, "kind") ?? "tick",
        agent: stringField(p, "agent") ?? undefined,
        tool: stringField(p, "tool") ?? undefined,
        status: stringField(p, "status") ?? undefined,
        message: stringField(p, "message") ?? undefined,
    };
}

// ── Hook ────────────────────────────────────────────────────


export interface UseChatEventsOptions {
    /** When false, the hook stays in ``idle`` and opens no socket.
     *  Default: true.  Used by tests and when the panel feature is
     *  disabled. */
    stream?: boolean;
}

export function useChatEvents(
    chatId: string | null,
    options: UseChatEventsOptions = {},
): UseChatEventsResult {
    const stream = options.stream ?? true;
    const [state, dispatch] = useReducer(chatEventsReducer, INITIAL);

    // Per-run terminal-grace timers — fire after FINISHED_GRACE_MS
    // to drop the row from the map so the fade-out animation has
    // time to play before unmount.
    const graceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
        new Map(),
    );

    useEffect(() => {
        if (chatId === null || !stream) {
            dispatch({type: "reset"});
            return;
        }
        if (typeof EventSource === "undefined") {
            // Test / SSR — stay idle.
            return;
        }
        dispatch({type: "connecting"});
        const url = `/api/chat-events/${encodeURIComponent(chatId)}`;
        const es = new EventSource(url);
        let openSeen = false;

        const handle = (ev: MessageEvent) => {
            if (!openSeen) {
                dispatch({type: "open"});
                openSeen = true;
            }
            try {
                const parsed = JSON.parse(ev.data) as ChatBloomEventOnWire;
                dispatch({type: "event", event: parsed});
                if (parsed.type === "chat.bloom.finished") {
                    // Schedule a graceful drop so the fade-out can play.
                    const prior = graceTimers.current.get(parsed.run_id);
                    if (prior !== undefined) clearTimeout(prior);
                    const timer = setTimeout(() => {
                        dispatch({type: "drop", runId: parsed.run_id});
                        graceTimers.current.delete(parsed.run_id);
                    }, FINISHED_GRACE_MS);
                    graceTimers.current.set(parsed.run_id, timer);
                }
            } catch (err) {
                dispatch({type: "error", error: `bad event: ${String(err)}`});
            }
        };

        const types = [
            "chat.bloom.attached",
            "chat.bloom.tick",
            "chat.bloom.finished",
        ];
        for (const t of types) es.addEventListener(t, handle as EventListener);
        es.addEventListener("message", handle as EventListener);

        es.onopen = () => {
            dispatch({type: "open"});
            openSeen = true;
        };
        es.onerror = () => {
            // EventSource auto-reconnects with a small backoff on
            // transient errors.  Surface the visual state so the
            // operator UI can show a "reconnecting…" indicator.
            // The reducer keeps existing entries — the next
            // discovery pass refreshes them.
            dispatch({type: "reconnecting"});
        };

        // Capture the ref inside the effect so the cleanup
        // closure uses the same Map instance as the effect — the
        // React lint rule warns when the cleanup reads
        // ``ref.current`` directly (could have changed by then).
        const timersAtMount = graceTimers.current;
        return () => {
            es.close();
            for (const timer of timersAtMount.values()) {
                clearTimeout(timer);
            }
            timersAtMount.clear();
        };
    }, [chatId, stream]);

    return {blooms: state.blooms, status: state.status, error: state.error};
}
