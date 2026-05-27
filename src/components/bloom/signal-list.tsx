"use client";

import Link from "next/link";

import type {BloomSignal} from "@/app/actions/bloom-signals";

import {RelativeTime} from "./relative-time";

export function SignalList({
    signals,
    loading,
}: {
    signals: BloomSignal[];
    loading: boolean;
}) {
    if (loading && signals.length === 0) {
        return <SignalListSkeleton />;
    }
    if (signals.length === 0) {
        return (
            <p className="text-sm text-orchid-muted py-8 text-center">
                No signals visible. (List endpoint is admin-only — non-admin
                callers see an empty list by design.)
            </p>
        );
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-orchid-border bg-orchid-card">
            <table className="w-full text-sm" aria-label="Bloom signals">
                <thead className="bg-orchid-surface text-orchid-dark text-xs uppercase tracking-wide">
                    <tr>
                        <th scope="col" className="text-left px-4 py-2">Signal</th>
                        <th scope="col" className="text-left px-4 py-2">Type</th>
                        <th scope="col" className="text-left px-4 py-2">Source</th>
                        <th scope="col" className="text-left px-4 py-2">User</th>
                        <th scope="col" className="text-left px-4 py-2">Bound</th>
                        <th scope="col" className="text-left px-4 py-2">Persisted</th>
                    </tr>
                </thead>
                <tbody>
                    {signals.map((signal) => (
                        <tr
                            key={signal.signal_id}
                            className="border-t border-orchid-border hover:bg-orchid-surface"
                        >
                            <td className="px-4 py-2 font-mono text-xs">
                                <Link
                                    href={`/bloom/signals/${signal.signal_id}`}
                                    aria-label={`Open signal ${signal.signal_id}`}
                                    className="text-orchid-accent hover:underline focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded"
                                >
                                    {signal.signal_id.slice(0, 8)}…
                                </Link>
                            </td>
                            <td className="px-4 py-2 text-orchid-dark">
                                {signal.type}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {signal.source}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {signal.user_id ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {signal.chat_binding !== null ? "yes" : "—"}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted">
                                <RelativeTime iso={signal.persisted_at} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SignalListSkeleton() {
    return (
        <div
            className="animate-pulse rounded-lg border border-orchid-border bg-orchid-card"
            aria-label="Loading signals"
        >
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="h-12 border-t border-orchid-border first:border-t-0"
                />
            ))}
        </div>
    );
}
