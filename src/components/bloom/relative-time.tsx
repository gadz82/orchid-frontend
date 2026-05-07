"use client";

/**
 * Relative + absolute timestamp (§F6).  Renders ``"12 min ago"``
 * with the absolute ISO8601 string in a tooltip.  Re-renders every
 * 30 seconds so "just now" → "1 min ago" without a page refresh.
 */

import {useEffect, useState} from "react";

export function RelativeTime({iso}: {iso: string | null}) {
    // ``now`` is held in state so the React lint rule banning
    // ``Date.now()`` in the render body is satisfied AND the
    // 30-second timer below has a single update path that
    // re-derives the label.
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        const handle = setInterval(() => setNow(Date.now()), 30_000);
        return () => clearInterval(handle);
    }, []);

    if (iso === null || iso === "") {
        return <span className="text-orchid-muted">—</span>;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
        return <span title={iso}>{iso}</span>;
    }
    const seconds = Math.round((now - date.getTime()) / 1000);
    const label = formatRelative(seconds);
    return (
        <time
            dateTime={iso}
            title={date.toISOString()}
            className="cursor-default"
        >
            {label}
        </time>
    );
}

function formatRelative(seconds: number): string {
    if (seconds < 0) return "just now";
    if (seconds < 30) return "just now";
    if (seconds < 90) return "1 min ago";
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 7200) return "1 hour ago";
    if (seconds < 86_400) return `${Math.round(seconds / 3600)} hours ago`;
    if (seconds < 172_800) return "1 day ago";
    if (seconds < 2_592_000) return `${Math.round(seconds / 86_400)} days ago`;
    if (seconds < 5_184_000) return "1 month ago";
    return `${Math.round(seconds / 2_592_000)} months ago`;
}
