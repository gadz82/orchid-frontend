"use client";

import {useState} from "react";

import {RunList} from "@/components/bloom/run-list";
import {useBloomRuns} from "@/hooks/use-bloom";
import type {BloomRunStatus} from "@/app/actions/bloom-runs";

/**
 * Default ``/bloom`` page — runs list with a status filter.
 *
 * The filter state lives in the URL via plain query params so
 * deep-linked reloads keep the operator on the same view.  Polling
 * is handled by ``useBloomRuns``; this component is dumb wiring.
 */
export default function BloomRunsIndex() {
    const [status, setStatus] = useState<BloomRunStatus | undefined>(undefined);
    const {runs, loading} = useBloomRuns({
        ...(status !== undefined ? {status} : {}),
        limit: 100,
    });

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Recent runs</h2>
                <StatusFilter status={status} onChange={setStatus} />
            </header>
            <RunList runs={runs} loading={loading} />
        </div>
    );
}

const STATUS_OPTIONS: {value: BloomRunStatus | "all"; label: string}[] = [
    {value: "all", label: "All"},
    {value: "running", label: "Running"},
    {value: "pending", label: "Pending"},
    {value: "succeeded", label: "Succeeded"},
    {value: "failed", label: "Failed"},
    {value: "cancelled", label: "Cancelled"},
    {value: "retry_scheduled", label: "Retry scheduled"},
];

function StatusFilter({
    status,
    onChange,
}: {
    status: BloomRunStatus | undefined;
    onChange: (s: BloomRunStatus | undefined) => void;
}) {
    return (
        <select
            value={status ?? "all"}
            onChange={(event) => {
                const v = event.target.value;
                onChange(v === "all" ? undefined : (v as BloomRunStatus));
            }}
            className="text-sm rounded-md border border-orchid-border bg-orchid-card text-orchid-text px-3 py-1.5"
            aria-label="Filter runs by status"
        >
            {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                </option>
            ))}
        </select>
    );
}
