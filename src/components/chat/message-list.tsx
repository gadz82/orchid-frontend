"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {MessageBubble, type Message} from "./message-bubble";
import {LoadingIndicator} from "./loading-indicator";
import {InlineBloomProgress} from "./inline-bloom-progress";
import {BloomActivityPill} from "./bloom-activity-pill";
import {OrchidIcon} from "@/components/icons/orchid-icon";
import {ChevronDown} from "lucide-react";

import type {BloomProgressState} from "@/hooks/use-chat-events";

interface MessageListProps {
    messages: Message[];
    isLoading: boolean;
    /** In-chat live progress cards keyed by run_id (Phase F2.5).
     *  Anchored under their ``source_message_id`` when set; cards
     *  with ``source_message_id === null`` render in a fallback
     *  bottom dock above the input box. */
    blooms?: Map<string, BloomProgressState>;
    /** Cancel handler — wired by ``<ChatContainer>`` to the
     *  existing ``cancelRun`` server action. */
    onCancelBloom?: (runId: string) => Promise<void> | void;
}

/**
 * Groups consecutive items by a key function.
 * Returns an array of {type: "single"|"group", items: Message[]}.
 */
function groupMessages(messages: Message[]) {
    const result: Array<{ type: "bubble" | "system-group"; items: Message[] }> = [];
    let systemBuffer: Message[] = [];

    const flushSystem = () => {
        if (systemBuffer.length > 0) {
            result.push({type: "system-group", items: [...systemBuffer]});
            systemBuffer = [];
        }
    };

    for (const msg of messages) {
        if (msg.role === "system") {
            systemBuffer.push(msg);
        } else {
            flushSystem();
            result.push({type: "bubble", items: [msg]});
        }
    }
    flushSystem();
    return result;
}

function SystemMessageGroup({messages}: { messages: Message[] }) {
    const [expanded, setExpanded] = useState(true);
    const last = messages[messages.length - 1];
    const hasMore = messages.length > 1;

    return (
        <div className="flex flex-col items-center py-0.5">
            {expanded && hasMore && (
                <div className="space-y-0.5 mb-0.5">
                    {messages.slice(0, -1).map((m) => (
                        <p key={m.id} className="text-sm text-orchid-muted/80 italic text-center">
                            {m.content}
                        </p>
                    ))}
                </div>
            )}
            <div
                className={`flex items-center gap-1.5 ${hasMore ? "cursor-pointer" : ""}`}
                onClick={hasMore ? () => setExpanded(!expanded) : undefined}
            >
                <p className="text-sm text-orchid-muted/90 italic">
                    {last.content}
                </p>
                {hasMore && (
                    <ChevronDown
                        className={`h-4 w-4 text-orchid-muted/80 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                )}
            </div>
        </div>
    );
}

/**
 * Bucket bloom progress states by their anchor (Phase F2.5 §6.4):
 *
 * - Cards with a ``source_message_id`` render under that message.
 * - Cards with ``source_message_id === null`` render in the
 *   bottom-dock fallback (collapsed via ``<BloomActivityPill>``
 *   when more than 2 active).
 *
 * Exported for unit tests.
 */
export function bucketBlooms(
    blooms: Map<string, BloomProgressState>,
): {
    anchored: Map<string, BloomProgressState[]>;
    unanchored: BloomProgressState[];
} {
    const anchored = new Map<string, BloomProgressState[]>();
    const unanchored: BloomProgressState[] = [];
    for (const bloom of blooms.values()) {
        if (bloom.source_message_id !== null) {
            const list = anchored.get(bloom.source_message_id) ?? [];
            list.push(bloom);
            anchored.set(bloom.source_message_id, list);
        } else {
            unanchored.push(bloom);
        }
    }
    return {anchored, unanchored};
}

const COLLAPSE_THRESHOLD = 2;

/**
 * Scrollable message list — auto-scrolls to the latest message.
 * Consecutive system messages are grouped with only the last visible.
 *
 * Phase F2.5 — accepts an optional ``blooms`` map from
 * ``useChatEvents``.  Cards with a ``source_message_id`` are
 * rendered immediately after the matching ``MessageBubble`` so the
 * progress visually anchors under the user message that produced
 * the binding.  Cards without an anchor land in a bottom dock
 * (collapsed via ``<BloomActivityPill>`` when more than two are
 * active to avoid overwhelming the input area).
 */
export function MessageList({messages, isLoading, blooms, onCancelBloom}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, isLoading]);

    const groups = groupMessages(messages);

    const {anchored, unanchored} = useMemo(
        () => (blooms !== undefined ? bucketBlooms(blooms) : {anchored: new Map<string, BloomProgressState[]>(), unanchored: []}),
        [blooms],
    );

    return (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
            {messages.length === 0 && !isLoading && (
                <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                        <div
                            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orchid-accent/10">
                            <OrchidIcon size={30} className="text-orchid-accent-glow"/>
                        </div>
                        <p className="text-sm font-medium text-orchid-text">
                            How can I help you today?
                        </p>
                        <p className="mt-1 text-xs text-orchid-muted">
                            Ask me anything to get started.
                        </p>
                    </div>
                </div>
            )}

            {groups.map((group, i) =>
                group.type === "system-group" ? (
                    <SystemMessageGroup key={`sys-${i}`} messages={group.items}/>
                ) : (
                    <BubbleWithProgress
                        key={group.items[0].id}
                        message={group.items[0]}
                        progressCards={anchored.get(group.items[0].id) ?? []}
                        onCancel={onCancelBloom}
                    />
                ),
            )}

            {isLoading && <LoadingIndicator/>}

            {unanchored.length > 0 && (
                unanchored.length > COLLAPSE_THRESHOLD ? (
                    <BloomActivityPill blooms={unanchored} onCancel={onCancelBloom}/>
                ) : (
                    <div className="space-y-1">
                        {unanchored.map((b) => (
                            <InlineBloomProgress
                                key={b.run_id}
                                bloom={b}
                                onCancel={onCancelBloom}
                            />
                        ))}
                    </div>
                )
            )}

            <div ref={bottomRef}/>
        </div>
    );
}

function BubbleWithProgress({
    message,
    progressCards,
    onCancel,
}: {
    message: Message;
    progressCards: BloomProgressState[];
    onCancel?: (runId: string) => Promise<void> | void;
}) {
    return (
        <div className="space-y-1">
            <MessageBubble message={message}/>
            {progressCards.map((b) => (
                <InlineBloomProgress key={b.run_id} bloom={b} onCancel={onCancel}/>
            ))}
        </div>
    );
}
