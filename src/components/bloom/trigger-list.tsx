"use client";

import Link from "next/link";

import type {BloomTrigger} from "@/app/actions/bloom-triggers";

export function TriggerList({
    triggers,
    loading,
}: {
    triggers: BloomTrigger[];
    loading: boolean;
}) {
    if (loading && triggers.length === 0) {
        return (
            <p className="text-sm text-orchid-muted py-8 text-center">
                Loading triggers…
            </p>
        );
    }
    if (triggers.length === 0) {
        return (
            <p className="text-sm text-orchid-muted py-8 text-center">
                No triggers registered.  Add one to <code>agents.yaml</code>{" "}
                under <code>events.triggers</code>.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-orchid-border bg-white">
            <table className="w-full text-sm" aria-label="Bloom triggers">
                <thead className="bg-orchid-surface text-orchid-dark text-xs uppercase tracking-wide">
                    <tr>
                        <th scope="col" className="text-left px-4 py-2">Trigger</th>
                        <th scope="col" className="text-left px-4 py-2">Parallelism</th>
                        <th scope="col" className="text-left px-4 py-2">Visibility</th>
                        <th scope="col" className="text-left px-4 py-2">Chat binding</th>
                    </tr>
                </thead>
                <tbody>
                    {triggers.map((t) => (
                        <tr
                            key={t.trigger_id}
                            className="border-t border-orchid-border hover:bg-orchid-surface"
                        >
                            <td className="px-4 py-2">
                                <Link
                                    href={`/bloom/triggers/${t.trigger_id}`}
                                    aria-label={`Open trigger ${t.trigger_id}`}
                                    className="text-orchid-accent hover:underline focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded"
                                >
                                    {t.trigger_id}
                                </Link>
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {t.parallelism}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {t.visibility}
                            </td>
                            <td className="px-4 py-2 text-orchid-muted text-xs">
                                {t.respect_chat_binding ? "yes" : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
