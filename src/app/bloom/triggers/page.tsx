"use client";

import {TriggerList} from "@/components/bloom/trigger-list";
import {useTriggers} from "@/hooks/use-bloom";

export default function TriggersIndex() {
    const {triggers, loading} = useTriggers();
    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-xl font-semibold">Triggers</h2>
                <p className="text-sm text-orchid-muted">
                    Trigger definitions are read-only in v1 — edit{" "}
                    <code>agents.yaml</code> and reload <code>orchid-api</code>{" "}
                    to change them.
                </p>
            </header>
            <TriggerList triggers={triggers} loading={loading} />
        </div>
    );
}
