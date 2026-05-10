"use client";

/**
 * ``RunStreamPane`` — live ``bloom.*`` event log for one run
 * (Phase F2).
 *
 * Subscribes to ``/api/bloom/stream/{runId}`` via ``useBloomRunStream``,
 * renders each event in chronological order, and pins the scroll
 * view to the bottom while the stream is live.  Once the user
 * scrolls up by hand we stop auto-scrolling so they can read past
 * events without being yanked back to the tail; clicking "Jump to
 * latest" re-pins.
 *
 * The pane is meant to live alongside the polled run header — it
 * does NOT duplicate run-level fields (status, attempt number, …);
 * it shows the event timeline and nothing else.
 */

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";

import {
    useBloomRunStream,
    type BloomStreamEvent,
    type BloomStreamStatus,
} from "@/hooks/use-bloom-run-stream";

import {RelativeTime} from "./relative-time";

export interface RunStreamPaneProps {
    runId: string;
    /** Disable the live socket — the pane renders its empty state.
     *  Used by tests and Storybook stubs. */
    disabled?: boolean;
}

export function RunStreamPane({runId, disabled = false}: RunStreamPaneProps) {
    const {events, status, error} = useBloomRunStream(runId, {
        stream: !disabled,
    });

    const containerRef = useRef<HTMLDivElement | null>(null);
    const [pinned, setPinned] = useState(true);

    // Auto-scroll to the bottom whenever a new event arrives, but
    // only if the user hasn't scrolled up by hand.
    useLayoutEffect(() => {
        if (!pinned) return;
        const el = containerRef.current;
        if (el === null) return;
        el.scrollTop = el.scrollHeight;
    }, [events.length, pinned]);

    const onScroll = useCallback(() => {
        const el = containerRef.current;
        if (el === null) return;
        const distanceToBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight;
        // Re-pin when within ~24px of the bottom; un-pin otherwise.
        setPinned(distanceToBottom < 24);
    }, []);

    // Reset pinning when the run changes (so the new stream starts
    // pinned to bottom regardless of the previous scroll position).
    // Defer the setState to a microtask to satisfy the React 19
    // ``set-state-in-effect`` rule — the cascading-render concern
    // doesn't apply here (we run only on ``runId`` changes) but the
    // microtask defers cleanly.
    useEffect(() => {
        queueMicrotask(() => setPinned(true));
    }, [runId]);

    return (
        <section aria-label="Bloom run event stream">
            <header className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted">
                    Live events
                </h2>
                <StreamStatusBadge status={status} count={events.length} />
            </header>
            <div
                ref={containerRef}
                onScroll={onScroll}
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Bloom run event log"
                className="h-64 overflow-y-auto rounded-md border border-orchid-border bg-white text-xs font-mono"
            >
                {events.length === 0 ? (
                    <EmptyState status={status} error={error} />
                ) : (
                    <ol className="divide-y divide-orchid-border">
                        {events.map((event, idx) => (
                            <EventRow
                                key={`${event.occurred_at}-${idx}`}
                                event={event}
                            />
                        ))}
                    </ol>
                )}
            </div>
            {!pinned && events.length > 0 && (
                <button
                    type="button"
                    onClick={() => {
                        setPinned(true);
                    }}
                    className="mt-2 text-xs text-orchid-accent hover:underline"
                >
                    Jump to latest
                </button>
            )}
        </section>
    );
}

// ── Sub-components ──────────────────────────────────────────

function StreamStatusBadge({
    status,
    count,
}: {
    status: BloomStreamStatus;
    count: number;
}) {
    const map: Record<BloomStreamStatus, {label: string; classes: string}> = {
        idle: {
            label: "Idle",
            classes: "bg-orchid-surface text-orchid-muted",
        },
        connecting: {
            label: "Connecting…",
            classes: "bg-amber-50 text-amber-800",
        },
        open: {
            label: `Live · ${count}`,
            classes: "bg-green-50 text-green-800",
        },
        finished: {
            label: `Finished · ${count}`,
            classes: "bg-orchid-surface text-orchid-dark",
        },
        error: {
            label: "Disconnected",
            classes: "bg-red-50 text-red-800",
        },
    };
    const meta = map[status];
    return (
        <span
            aria-label={`Stream status: ${meta.label}`}
            className={`text-xs px-2 py-0.5 rounded-full ${meta.classes}`}
        >
            {meta.label}
        </span>
    );
}

function EmptyState({
    status,
    error,
}: {
    status: BloomStreamStatus;
    error: string | null;
}) {
    if (status === "error") {
        return (
            <p className="px-3 py-4 text-sm text-red-700">
                Stream error{error !== null ? `: ${error}` : ""}.
            </p>
        );
    }
    if (status === "idle") {
        return (
            <p className="px-3 py-4 text-sm text-orchid-muted">
                Stream not started.
            </p>
        );
    }
    return (
        <p className="px-3 py-4 text-sm text-orchid-muted">
            Waiting for first event…
        </p>
    );
}

function EventRow({event}: {event: BloomStreamEvent}) {
    const summary = describeEvent(event);
    return (
        <li className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 items-start">
            <RelativeTime iso={event.occurred_at} />
            <div className="min-w-0">
                <p className="text-orchid-dark">
                    <span className="font-semibold">{event.type}</span>
                    {summary !== null && (
                        <span className="ml-2 text-orchid-muted font-normal">
                            {summary}
                        </span>
                    )}
                </p>
            </div>
        </li>
    );
}

/**
 * Render a one-line summary of the event's payload.  Returns ``null``
 * for unknown event types — the type itself is enough.
 *
 * Exported for unit tests.
 */
export function describeEvent(event: BloomStreamEvent): string | null {
    const p = event.payload ?? {};
    switch (event.type) {
        case "bloom.run.queued": {
            const trigger = stringField(p, "trigger_id");
            return trigger !== null ? `trigger=${trigger}` : null;
        }
        case "bloom.run.started": {
            const attempt = numberField(p, "attempt_number");
            return attempt !== null ? `attempt #${attempt}` : null;
        }
        case "bloom.run.finished": {
            const status = stringField(p, "status");
            const err = stringField(p, "error");
            if (status === null) return null;
            if (err !== null) return `${status} — ${truncate(err, 80)}`;
            return status;
        }
        case "bloom.signal.ingested": {
            const sigType = stringField(p, "type");
            const source = stringField(p, "source");
            if (sigType === null && source === null) return null;
            return `${sigType ?? "?"} from ${source ?? "?"}`;
        }
        default:
            return null;
    }
}

function stringField(p: Record<string, unknown>, key: string): string | null {
    const v = p[key];
    return typeof v === "string" && v.length > 0 ? v : null;
}

function numberField(p: Record<string, unknown>, key: string): number | null {
    const v = p[key];
    return typeof v === "number" ? v : null;
}

function truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
