"use client";

import {SignalList} from "@/components/bloom/signal-list";
import {useSignals} from "@/hooks/use-bloom";

export default function SignalsIndex() {
    const {signals, loading} = useSignals({limit: 100});
    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-xl font-semibold">Signal log</h2>
                <p className="text-sm text-orchid-muted">
                    Recent signals ingested by the dispatcher.  Admin only —
                    non-admin callers see an empty list by design.
                </p>
            </header>
            <SignalList signals={signals} loading={loading} />
        </div>
    );
}
