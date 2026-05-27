"use client";

import {use, useEffect, useState, useTransition} from "react";

import {
    type BloomSignal,
    getSignal,
    replaySignal,
} from "@/app/actions/bloom-signals";
import {RelativeTime} from "@/components/bloom/relative-time";

export default function SignalDetailPage({
    params,
}: {
    params: Promise<{signalId: string}>;
}) {
    const {signalId} = use(params);
    const [signal, setSignal] = useState<BloomSignal | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();
    const [actionResult, setActionResult] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const s = await getSignal(signalId);
            if (!cancelled) {
                setSignal(s);
                setLoading(false);
            }
        };
        void tick();
        return () => {
            cancelled = true;
        };
    }, [signalId]);

    const handleReplay = () => {
        startTransition(async () => {
            const r = await replaySignal(signalId);
            if ("error" in r) {
                setActionResult(`Replay failed: ${r.error}`);
            } else {
                setActionResult(`Replay queued (msg ${r.queueMsgId}).`);
            }
        });
    };

    if (loading) {
        return <div className="text-sm text-orchid-muted">Loading signal…</div>;
    }
    if (signal === null) {
        return (
            <div className="rounded-md border border-orchid-border bg-orchid-card p-8 text-center">
                <h2 className="text-lg font-semibold mb-2">Signal not found</h2>
                <p className="text-sm text-orchid-muted">
                    Signal does not exist, or is not visible to you.
                </p>
            </div>
        );
    }
    return (
        <div className="space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Signal{" "}
                        <span className="font-mono text-base text-orchid-muted">
                            {signal.signal_id}
                        </span>
                    </h1>
                    <p className="text-sm text-orchid-muted">
                        Type <span className="text-orchid-dark">{signal.type}</span>,
                        source <span className="text-orchid-dark">{signal.source}</span>
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <button
                        type="button"
                        onClick={handleReplay}
                        disabled={pending}
                        className="px-3 py-1.5 rounded-md text-sm bg-orchid-accent text-white hover:bg-orchid-accent/90 disabled:opacity-50"
                    >
                        Replay (admin only)
                    </button>
                    {actionResult !== null && (
                        <span className="text-xs text-orchid-muted">
                            {actionResult}
                        </span>
                    )}
                </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <KvPanel
                    title="Identity"
                    rows={[
                        ["Tenant", signal.tenant_key],
                        ["User", signal.user_id ?? "—"],
                        ["Correlation", signal.correlation_id ?? "—"],
                        ["Dedupe key", signal.dedupe_key ?? "—"],
                    ]}
                />
                <KvPanel
                    title="Timing"
                    rows={[
                        ["Occurred at", signal.occurred_at],
                        ["Persisted at", signal.persisted_at],
                        ["Relay status", signal.relay_status],
                    ]}
                />
            </section>

            <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                    Payload
                </h2>
                <pre className="rounded-md bg-orchid-surface border border-orchid-border p-4 text-xs whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(signal.payload, null, 2)}
                </pre>
            </section>

            {signal.identity_claim !== null && (
                <section>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                        Identity claim
                    </h2>
                    <pre className="rounded-md bg-orchid-surface border border-orchid-border p-4 text-xs whitespace-pre-wrap">
                        {JSON.stringify(signal.identity_claim, null, 2)}
                    </pre>
                </section>
            )}

            {signal.chat_binding !== null && (
                <section>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-orchid-muted mb-2">
                        Chat binding (§25)
                    </h2>
                    <pre className="rounded-md bg-orchid-surface border border-orchid-border p-4 text-xs whitespace-pre-wrap">
                        {JSON.stringify(signal.chat_binding, null, 2)}
                    </pre>
                    <p className="text-xs text-orchid-muted mt-2">
                        <RelativeTime iso={signal.persisted_at} /> · The runner
                        re-validates this binding at runtime — cross-user
                        smuggling attempts are rejected even if the trigger
                        opted in.
                    </p>
                </section>
            )}
        </div>
    );
}

function KvPanel({title, rows}: {title: string; rows: [string, string][]}) {
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
