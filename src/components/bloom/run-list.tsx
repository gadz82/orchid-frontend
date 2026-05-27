"use client";

import Link from "next/link";

import type {BloomRun} from "@/app/actions/bloom-runs";

import {RelativeTime} from "./relative-time";
import {StatusPill} from "./status-pill";

/**
 * Compact run table.  Polled by ``useBloomRuns`` upstream; the
 * component itself is dumb — it renders whatever rows it gets.
 *
 * The link target is ``/bloom/runs/{run_id}`` for the detail view.
 * Visibility (§26) is enforced upstream — clicking through to a
 * not-visible run produces a clean 404 page; the link is still
 * present in the row.
 */

export function RunList({
    runs,
    loading,
    emptyText,
}: {
    runs: BloomRun[];
    loading: boolean;
    emptyText?: string;
}) {
    if (loading && runs.length === 0) {
        return <RunListSkeleton />;
    }
    if (runs.length === 0) {
        return (
            <p className="text-sm text-orchid-muted py-8 text-center">
                {emptyText ?? "No runs yet."}
            </p>
        );
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-orchid-border bg-orchid-card">
            <table
                className="w-full text-sm"
                aria-label="Bloom runs"
            >
                <thead className="bg-orchid-surface text-orchid-dark text-xs uppercase tracking-wide">
                    <tr>
                        <th scope="col" className="text-left px-4 py-2">Run</th>
                        <th scope="col" className="text-left px-4 py-2">Trigger</th>
                        <th scope="col" className="text-left px-4 py-2">Status</th>
                        <th scope="col" className="text-left px-4 py-2">Agent</th>
                        <th scope="col" className="text-left px-4 py-2">Visibility</th>
                        <th scope="col" className="text-left px-4 py-2">Queued</th>
                        <th scope="col" className="text-left px-4 py-2">Finished</th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => (
                        <tr
                            key={run.run_id}
                            className="border-t border-orchid-border hover:bg-orchid-surface"
                        >
                            <td className="px-4 py-2 font-mono text-xs text-orchid-dark">
                                <Link
                                    href={`/bloom/runs/${run.run_id}`}
                                    aria-label={`Open run ${run.run_id}, attempt ${run.attempt_number}`}
                                    className="text-orchid-accent hover:underline focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded"
                                >
                                    {run.run_id.slice(0, 8)}…
                                </Link>
                                <span className="text-orchid-muted ml-2">
                                    #{run.attempt_number}
                                </span>
                            </td>
                            <td className="px-4 py-2 text-orchid-dark">
                                {run.trigger_id}
                            </td>
                            <td className="px-4 py-2">
                                <StatusPill status={run.status} />
                            </td>
                            <td className="px-4 py-2 text-orchid-dark">
                                {run.agent_name}
                            </td>
                            <td className="px-4 py-2 text-xs text-orchid-muted">
                                {run.visibility}
                                {run.visibility_user_id !== null && (
                                    <span className="ml-1">
                                        ({run.visibility_user_id})
                                    </span>
                                )}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted">
                                <RelativeTime iso={run.queued_at} />
                            </td>
                            <td className="px-4 py-2 text-orchid-muted">
                                <RelativeTime iso={run.finished_at} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RunListSkeleton() {
    return (
        <div
            className="animate-pulse rounded-lg border border-orchid-border bg-orchid-card"
            aria-label="Loading runs"
        >
            {[0, 1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="h-12 border-t border-orchid-border first:border-t-0"
                />
            ))}
        </div>
    );
}
