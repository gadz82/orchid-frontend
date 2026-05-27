"use client";

import {useState, useTransition} from "react";

import {
    cancelRun,
    retryRun,
    type BloomRunDetail,
} from "@/app/actions/bloom-runs";

import {RelativeTime} from "./relative-time";
import {RunStreamPane} from "./run-stream-pane";
import {StatusPill} from "./status-pill";

/**
 * Single-run detail panel — header + identity / signal panel +
 * result / error pane + live event stream + retry / cancel actions.
 *
 * The polled hook (``useBloomRun``) drives header + result / timing
 * fields; ``<RunStreamPane>`` opens an SSE subscription against
 * ``/api/bloom/stream/{runId}`` for the live event log.  The two
 * are independent — the stream may end (terminal event) before the
 * polled detail row reflects the new status; the page reconciles
 * itself on the next 3 s poll.
 */

const TERMINAL = new Set<BloomRunDetail["status"]>([
    "succeeded",
    "failed",
    "cancelled",
]);

export function RunDetail({
    run,
    onRefresh,
}: {
    run: BloomRunDetail;
    onRefresh: () => Promise<void>;
}) {
    const [pending, startTransition] = useTransition();
    const [actionResult, setActionResult] = useState<string | null>(null);

    const handleCancel = () => {
        startTransition(async () => {
            const r = await cancelRun(run.run_id);
            if ("error" in r) {
                setActionResult(`Cancel failed: ${r.error}`);
            } else {
                setActionResult("Cancel requested.");
                await onRefresh();
            }
        });
    };
    const handleRetry = () => {
        startTransition(async () => {
            const r = await retryRun(run.run_id);
            if ("error" in r) {
                setActionResult(`Retry failed: ${r.error}`);
            } else {
                setActionResult(
                    `Retry queued (queue_msg_id=${r.queueMsgId}).`,
                );
                await onRefresh();
            }
        });
    };

    const isTerminal = TERMINAL.has(run.status);

    return (
        <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-orchid-dark mb-1">
                        Run{" "}
                        <span className="font-mono text-base text-orchid-muted">
                            {run.run_id}
                        </span>
                    </h1>
                    <p className="text-sm text-orchid-muted">
                        Trigger <span className="text-orchid-dark">{run.trigger_id}</span>
                        , attempt #{run.attempt_number}, agent{" "}
                        <span className="text-orchid-dark">{run.agent_name}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <StatusPill status={run.status} />
                </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KvPanel
                    title="Identity & visibility"
                    rows={[
                        ["Visibility", run.visibility],
                        [
                            "Visibility user",
                            run.visibility_user_id ?? "—",
                        ],
                    ]}
                />
                <KvPanel
                    title="Timing"
                    rows={[
                        ["Queued", iso(run.queued_at)],
                        ["Started", iso(run.started_at)],
                        ["Finished", iso(run.finished_at)],
                        ["Next retry", iso(run.next_retry_at)],
                    ]}
                />
            </section>

            <RunStreamPane runId={run.run_id} />

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                    Result
                </h2>
                {run.error !== null && run.error !== "" ? (
                    <div className="rounded-md bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
                        <p className="font-semibold mb-1">Error</p>
                        <pre className="whitespace-pre-wrap font-mono text-xs">
                            {run.error}
                        </pre>
                    </div>
                ) : run.result === null ? (
                    <p className="text-sm text-orchid-muted">
                        No result yet —{" "}
                        <RelativeTime iso={run.queued_at} /> queued
                        {!isTerminal && ", still in flight"}.
                    </p>
                ) : (
                    <pre className="rounded-md bg-orchid-card border border-orchid-border p-4 text-xs text-orchid-text whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(run.result, null, 2)}
                    </pre>
                )}
            </section>

            <section aria-labelledby="run-operations-heading">
                <h2
                    id="run-operations-heading"
                    className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2"
                >
                    Operations
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={pending || isTerminal}
                        aria-label={`Cancel run ${run.run_id}`}
                        aria-busy={pending}
                        className="px-3 py-1.5 rounded-md text-sm bg-orchid-surface text-orchid-text border border-orchid-border hover:bg-orchid-card focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleRetry}
                        disabled={pending}
                        aria-label={`Retry run ${run.run_id}`}
                        aria-busy={pending}
                        className="px-3 py-1.5 rounded-md text-sm bg-orchid-accent text-white hover:bg-orchid-accent/90 focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 disabled:opacity-50"
                    >
                        Retry
                    </button>
                    {actionResult !== null && (
                        <span
                            className="text-xs text-orchid-dark ml-2"
                            role="status"
                        >
                            {actionResult}
                        </span>
                    )}
                </div>
            </section>
        </div>
    );
}

function KvPanel({
    title,
    rows,
}: {
    title: string;
    rows: [string, string][];
}) {
    return (
        <div className="rounded-md border border-orchid-border bg-orchid-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                {title}
            </h3>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
                {rows.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="text-orchid-muted">{k}</dt>
                        <dd className="text-orchid-dark font-mono text-xs">{v}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function iso(value: string | null): string {
    return value ?? "—";
}
