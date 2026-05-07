"use client";

/**
 * ``<InlineBloomProgress>`` — in-chat live progress card for one
 * Bloom (Phase F2.5).
 *
 * Anchors visually under the user message that triggered the
 * binding (``source_message_id``).  Renders:
 *
 * - Trigger / agent identity in the header.
 * - Self-updating elapsed timer (``elapsed = now - attached_at``).
 * - Last 5 ticks by default; click "show all" to expand the full
 *   buffer (capped at 50 by the hook).
 * - "Open in /bloom" link to the run detail page.
 * - Cancel button — visible iff ``identity_mode === "act_as_user"``
 *   per §LS3.  ``addressed_to_user`` runs hide the button (the
 *   chat owner is the addressed user, not the operator).
 *
 * State source: a single :class:`BloomProgressState` row from
 * ``useChatEvents``.  The component is **pure-render** — all state
 * mutations live in the hook.
 *
 * Animations: Tailwind transitions (CSS), with a graceful exit
 * driven by the parent unmounting the row 2 s after a terminal
 * event.  Honours ``prefers-reduced-motion`` automatically because
 * the transitions sit on standard ``transition-*`` utilities.
 */

import {useEffect, useState} from "react";
import {Activity, AlertTriangle, CheckCircle2, ExternalLink, X} from "lucide-react";
import Link from "next/link";

import type {BloomProgressState} from "@/hooks/use-chat-events";

const DEFAULT_VISIBLE_TICKS = 5;

export interface InlineBloomProgressProps {
    bloom: BloomProgressState;
    /** Cancel handler — wired by the parent via the existing
     *  ``cancelRun`` server action.  When undefined the cancel
     *  button is hidden regardless of identity mode (used in
     *  read-only contexts and tests). */
    onCancel?: (runId: string) => Promise<void> | void;
}

export function InlineBloomProgress({bloom, onCancel}: InlineBloomProgressProps) {
    const [showAll, setShowAll] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [cancelPending, setCancelPending] = useState(false);

    // 1 s tick to update the elapsed-timer label.  Stops on
    // terminal status — no need to re-render once frozen.
    useEffect(() => {
        if (bloom.status !== "running") return;
        const handle = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(handle);
    }, [bloom.status]);

    const attachedMs = Date.parse(bloom.attached_at);
    const elapsed = Number.isFinite(attachedMs)
        ? Math.max(0, Math.round((now - attachedMs) / 1000))
        : 0;

    const visibleTicks = showAll
        ? bloom.ticks
        : bloom.ticks.slice(-DEFAULT_VISIBLE_TICKS);

    const canCancel =
        onCancel !== undefined &&
        bloom.status === "running" &&
        bloom.identity_mode === "act_as_user";

    const handleCancel = async () => {
        if (onCancel === undefined) return;
        setCancelPending(true);
        try {
            await onCancel(bloom.run_id);
        } finally {
            setCancelPending(false);
        }
    };

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={`Bloom progress for ${bloom.trigger_id || "background work"}`}
            className={`my-3 rounded-lg border px-3 py-2 transition-opacity duration-300 ${
                bloom.status === "running"
                    ? "border-orchid-accent/30 bg-orchid-accent/5"
                    : bloom.status === "failed"
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-orchid-border bg-orchid-surface opacity-90"
            }`}
        >
            <header className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <StatusGlyph status={bloom.status} />
                    <p className="text-xs font-medium text-orchid-dark truncate">
                        {bloom.trigger_id || "Background work"}
                        {bloom.agent_name && (
                            <span className="ml-1.5 text-orchid-muted">
                                · {bloom.agent_name}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {bloom.status === "running" && (
                        <span
                            className="text-[11px] text-orchid-muted tabular-nums"
                            aria-label={`Elapsed ${elapsed} seconds`}
                        >
                            {formatElapsed(elapsed)}
                        </span>
                    )}
                    <Link
                        href={`/bloom/runs/${bloom.run_id}`}
                        className="text-[11px] text-orchid-accent hover:underline focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded inline-flex items-center gap-0.5"
                        aria-label={`Open run ${bloom.run_id} in Bloom panel`}
                    >
                        open
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                    {canCancel && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={cancelPending}
                            aria-label={`Cancel run ${bloom.run_id}`}
                            aria-busy={cancelPending}
                            className="text-[11px] text-orchid-dark hover:text-red-700 focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded inline-flex items-center gap-0.5 disabled:opacity-50"
                        >
                            <X className="h-3 w-3" aria-hidden="true" />
                            cancel
                        </button>
                    )}
                </div>
            </header>

            {bloom.error !== null && bloom.error !== "" && (
                <p className="mt-1 text-[11px] text-red-700">
                    {bloom.error}
                </p>
            )}

            {bloom.ticks.length > 0 && (
                <ol className="mt-2 space-y-1 text-[11px]" aria-label="Recent activity">
                    {visibleTicks.map((tick, idx) => (
                        <li
                            key={`${tick.occurred_at}-${idx}`}
                            className="flex items-baseline gap-1.5 text-orchid-muted"
                        >
                            <span className="text-orchid-dark/70 font-mono shrink-0">
                                {tick.kind}
                            </span>
                            <span className="truncate">
                                {describeTick(tick)}
                            </span>
                        </li>
                    ))}
                </ol>
            )}

            {bloom.ticks.length > DEFAULT_VISIBLE_TICKS && (
                <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="mt-1 text-[11px] text-orchid-accent hover:underline focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded"
                    aria-expanded={showAll}
                >
                    {showAll
                        ? "show less"
                        : `show all ${bloom.ticks.length} ticks`}
                </button>
            )}
        </div>
    );
}

// ── Helpers ─────────────────────────────────────────────────


function StatusGlyph({status}: {status: BloomProgressState["status"]}) {
    if (status === "running") {
        return (
            <Activity
                className="h-3.5 w-3.5 text-orchid-accent animate-pulse motion-reduce:animate-none shrink-0"
                aria-hidden="true"
            />
        );
    }
    if (status === "failed") {
        return (
            <AlertTriangle
                className="h-3.5 w-3.5 text-red-700 shrink-0"
                aria-hidden="true"
            />
        );
    }
    return (
        <CheckCircle2
            className="h-3.5 w-3.5 text-green-700 shrink-0"
            aria-hidden="true"
        />
    );
}

/**
 * Format an elapsed-seconds count as a human-readable string.
 * Exported for unit tests.
 */
export function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}

/**
 * Render a one-line tick summary.  Uses redacted fields only
 * (per Phase 4.5 §LSQ6 default — payloads carry just
 * ``kind``/``agent``/``tool``/``status``/``message``).
 *
 * Exported for unit tests.
 */
export function describeTick(tick: {
    agent?: string;
    tool?: string;
    status?: string;
    message?: string;
}): string {
    const parts: string[] = [];
    if (tick.agent) parts.push(tick.agent);
    if (tick.tool) parts.push(tick.tool);
    if (tick.status) parts.push(tick.status);
    if (tick.message) parts.push(tick.message);
    return parts.length > 0 ? parts.join(" · ") : "";
}
