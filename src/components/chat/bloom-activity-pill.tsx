"use client";

/**
 * ``<BloomActivityPill>`` — collapse view for the chat-side
 * progress cards (Phase F2.5 §LS4).
 *
 * Renders a single pill above the input box when more than 2 Blooms
 * are active in the chat: ``"3 background tasks running [^]"``.
 * Click expands a panel that stacks each ``<InlineBloomProgress>``.
 *
 * Used by the bottom-dock fallback rendering in ``<MessageList>``
 * — the anchored cards (those with a ``source_message_id``) keep
 * their inline placement under the originating message, the
 * unanchored ones collapse here when there are too many.
 */

import {useState} from "react";
import {Activity, ChevronDown} from "lucide-react";

import type {BloomProgressState} from "@/hooks/use-chat-events";

import {InlineBloomProgress} from "./inline-bloom-progress";

export interface BloomActivityPillProps {
    blooms: BloomProgressState[];
    onCancel?: (runId: string) => Promise<void> | void;
}

export function BloomActivityPill({blooms, onCancel}: BloomActivityPillProps) {
    const [expanded, setExpanded] = useState(false);
    const running = blooms.filter((b) => b.status === "running").length;
    const total = blooms.length;
    if (total === 0) return null;
    return (
        <div className="px-4 pt-2 pb-1">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls="bloom-activity-panel"
                aria-label={`${running} background tasks running, click to ${expanded ? "collapse" : "expand"}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-orchid-accent/30 bg-orchid-accent/5 px-3 py-1 text-xs text-orchid-dark hover:bg-orchid-accent/10 focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2"
            >
                <Activity
                    className="h-3.5 w-3.5 text-orchid-accent animate-pulse motion-reduce:animate-none"
                    aria-hidden="true"
                />
                <span>
                    {running > 0
                        ? `${running} background task${running === 1 ? "" : "s"} running`
                        : `${total} background task${total === 1 ? "" : "s"}`}
                </span>
                <ChevronDown
                    className={`h-3.5 w-3.5 text-orchid-muted transition-transform motion-reduce:transition-none ${
                        expanded ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                />
            </button>
            {expanded && (
                <div
                    id="bloom-activity-panel"
                    className="mt-2 space-y-1"
                    role="region"
                    aria-label="Background tasks panel"
                >
                    {blooms.map((b) => (
                        <InlineBloomProgress
                            key={b.run_id}
                            bloom={b}
                            onCancel={onCancel}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
