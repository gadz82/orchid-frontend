"use client";

import type {BloomRunStatus} from "@/app/actions/bloom-runs";

/**
 * Coloured status pill for run rows.  Colours follow the §F7
 * decision and aim for WCAG AA contrast on the small-text
 * `text-xs font-medium` body shown inside the pill.  The neutral
 * pending / retry pills now use ``text-orchid-dark`` against
 * ``bg-orchid-surface`` (≈ 12.6:1) instead of the old ``orchid-muted``
 * pairing that fell below 4.5:1.  Running pills move to a slightly
 * deeper accent tint with a darker brand text.
 */
const STATUS_TO_TONE: Record<
    BloomRunStatus,
    {bg: string; text: string; label: string}
> = {
    succeeded: {bg: "bg-green-100", text: "text-green-900", label: "Succeeded"},
    running: {
        bg: "bg-orchid-accent/20",
        text: "text-orchid-dark",
        label: "Running",
    },
    pending: {
        bg: "bg-orchid-surface",
        text: "text-orchid-dark",
        label: "Pending",
    },
    retry_scheduled: {
        bg: "bg-amber-100",
        text: "text-amber-900",
        label: "Retry scheduled",
    },
    failed: {bg: "bg-red-100", text: "text-red-900", label: "Failed"},
    cancelled: {bg: "bg-gray-200", text: "text-gray-900", label: "Cancelled"},
};

export function StatusPill({status}: {status: BloomRunStatus}) {
    const tone = STATUS_TO_TONE[status] ?? {
        bg: "bg-orchid-surface",
        text: "text-orchid-muted",
        label: status,
    };
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tone.bg} ${tone.text}`}
            aria-label={`Run status: ${tone.label}`}
        >
            {tone.label}
        </span>
    );
}
