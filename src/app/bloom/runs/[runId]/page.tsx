"use client";

import {use} from "react";

import {RunDetail} from "@/components/bloom/run-detail";
import {useBloomRun} from "@/hooks/use-bloom";

export default function BloomRunDetailPage({
    params,
}: {
    params: Promise<{runId: string}>;
}) {
    const {runId} = use(params);
    const {run, loading, refresh} = useBloomRun(runId);

    if (loading && run === null) {
        return (
            <div className="text-sm text-orchid-muted">
                Loading run {runId.slice(0, 8)}…
            </div>
        );
    }
    if (run === null) {
        return (
            <div className="rounded-md border border-orchid-border bg-orchid-card p-8 text-center">
                <h2 className="text-lg font-semibold mb-2">Run not found</h2>
                <p className="text-sm text-orchid-muted">
                    The run does not exist, or it&apos;s not visible to your
                    bearer.  Visibility (§26) is enforced upstream — non-admin
                    users only see runs they own (or their tenant&apos;s
                    publicly-visible runs).
                </p>
            </div>
        );
    }
    return <RunDetail run={run} onRefresh={refresh} />;
}
