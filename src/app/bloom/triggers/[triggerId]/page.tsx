"use client";

import {use, useEffect, useState} from "react";

import type {BloomRun} from "@/app/actions/bloom-runs";
import {listRunsForTrigger} from "@/app/actions/bloom-runs";
import {getTrigger, type BloomTrigger} from "@/app/actions/bloom-triggers";
import {RunList} from "@/components/bloom/run-list";

export default function TriggerDetailPage({
    params,
}: {
    params: Promise<{triggerId: string}>;
}) {
    const {triggerId} = use(params);
    const [trigger, setTrigger] = useState<BloomTrigger | null>(null);
    const [runs, setRuns] = useState<BloomRun[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const [t, r] = await Promise.all([
                getTrigger(triggerId),
                listRunsForTrigger(triggerId, 50),
            ]);
            if (!cancelled) {
                setTrigger(t);
                setRuns(r);
                setLoading(false);
            }
        };
        void tick();
        return () => {
            cancelled = true;
        };
    }, [triggerId]);

    if (loading) {
        return <div className="text-sm text-orchid-muted">Loading trigger…</div>;
    }
    if (trigger === null) {
        return (
            <div className="rounded-md border border-orchid-border bg-white p-8 text-center">
                <h2 className="text-lg font-semibold mb-2">Trigger not found</h2>
                <p className="text-sm text-orchid-muted">
                    No trigger with id <code>{triggerId}</code> is registered.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">
                    {trigger.trigger_id}
                </h1>
                <p className="text-sm text-orchid-muted">
                    Parallelism: <span className="text-orchid-dark">{trigger.parallelism}</span>{" "}
                    · Visibility: <span className="text-orchid-dark">{trigger.visibility}</span>
                    {trigger.respect_chat_binding && (
                        <span> · respects chat binding (§25)</span>
                    )}
                </p>
            </header>
            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                    Recent runs
                </h2>
                <RunList runs={runs} loading={false} />
            </section>
        </div>
    );
}
