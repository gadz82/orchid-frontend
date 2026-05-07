"use client";

import {useState, useTransition} from "react";

import {
    setScheduleEnabled,
    type BloomSchedule,
} from "@/app/actions/bloom-schedules";

import {RelativeTime} from "./relative-time";

/**
 * Schedule list with inline enable/disable toggle (§F4).
 *
 * Optimistic update: the toggle flips state immediately while the
 * server action runs.  If the action errors, the toggle reverts and
 * a small inline error message appears.  Refresh hook keeps polling
 * in the background so eventual consistency wins regardless.
 */

export function ScheduleList({
    schedules,
    loading,
    onRefresh,
}: {
    schedules: BloomSchedule[];
    loading: boolean;
    onRefresh: () => Promise<void>;
}) {
    if (loading && schedules.length === 0) {
        return (
            <div
                className="animate-pulse rounded-lg border border-orchid-border bg-white p-4 text-sm text-orchid-muted"
                aria-label="Loading schedules"
            >
                Loading schedules…
            </div>
        );
    }
    if (schedules.length === 0) {
        return (
            <p className="text-sm text-orchid-muted py-8 text-center">
                No schedules visible.  Schedules are admin-only — non-admin
                callers see an empty list by design.
            </p>
        );
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-orchid-border bg-white">
            <table className="w-full text-sm" aria-label="Bloom schedules">
                <thead className="bg-orchid-surface text-orchid-dark text-xs uppercase tracking-wide">
                    <tr>
                        <th scope="col" className="text-left px-4 py-2">Schedule</th>
                        <th scope="col" className="text-left px-4 py-2">Trigger</th>
                        <th scope="col" className="text-left px-4 py-2">Cadence</th>
                        <th scope="col" className="text-left px-4 py-2">Last fire</th>
                        <th scope="col" className="text-left px-4 py-2">Next fire</th>
                        <th scope="col" className="text-left px-4 py-2">Enabled</th>
                    </tr>
                </thead>
                <tbody>
                    {schedules.map((s) => (
                        <ScheduleRow
                            key={s.schedule_id}
                            schedule={s}
                            onRefresh={onRefresh}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ScheduleRow({
    schedule,
    onRefresh,
}: {
    schedule: BloomSchedule;
    onRefresh: () => Promise<void>;
}) {
    // Optimistic state — flips immediately, reverts on error.
    const [optimistic, setOptimistic] = useState<boolean>(schedule.enabled);
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const cadence =
        schedule.cron !== null
            ? schedule.cron
            : schedule.interval_seconds !== null
              ? `every ${schedule.interval_seconds}s`
              : "—";

    const handleToggle = () => {
        const next = !optimistic;
        setOptimistic(next);
        setError(null);
        startTransition(async () => {
            const result = await setScheduleEnabled(schedule.schedule_id, next);
            if ("error" in result) {
                setError(result.error);
                setOptimistic(!next); // rollback
                return;
            }
            await onRefresh();
        });
    };

    return (
        <tr className="border-t border-orchid-border">
            <td className="px-4 py-2 font-mono text-xs text-orchid-dark">
                {schedule.schedule_id}
            </td>
            <td className="px-4 py-2 text-orchid-dark">{schedule.trigger_id}</td>
            <td className="px-4 py-2 text-orchid-muted text-xs">{cadence}</td>
            <td className="px-4 py-2 text-orchid-muted">
                <RelativeTime iso={schedule.last_fire_at} />
            </td>
            <td className="px-4 py-2 text-orchid-muted">
                <RelativeTime iso={schedule.next_fire_at} />
            </td>
            <td className="px-4 py-2">
                <button
                    type="button"
                    role="switch"
                    aria-checked={optimistic}
                    aria-label={`Toggle schedule ${schedule.schedule_id}`}
                    aria-busy={pending}
                    disabled={pending}
                    onClick={handleToggle}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 ${
                        optimistic
                            ? "bg-orchid-accent/20 text-orchid-dark"
                            : "bg-gray-200 text-gray-900"
                    } disabled:opacity-50`}
                >
                    {optimistic ? "Enabled" : "Disabled"}
                </button>
                {error !== null && (
                    <span className="ml-2 text-xs text-red-700" role="alert">
                        {error}
                    </span>
                )}
            </td>
        </tr>
    );
}
