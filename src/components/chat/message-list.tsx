"use client";

import {useEffect, useRef, useState, type ReactElement} from "react";
import {MessageBubble, type Message} from "./message-bubble";
import {LoadingIndicator} from "./loading-indicator";
import {OrchidIcon} from "@/components/icons/orchid-icon";
import {ChevronDown} from "lucide-react";

interface MessageListProps {
    messages: Message[];
    isLoading: boolean;
}

/** Internal grouping shape produced by :func:`groupMessages`. */
interface MessageGroup {
    type: GroupType;
    items: Message[];
}

/**
 * Renderer registry — adding a new visual treatment for a message type
 * (e.g. ``"tool-call"`` cards, code-block copy-buttons) is a registry
 * entry, not a switch-statement edit. ``register`` keeps the door open
 * for future renderers without touching the loop in :func:`MessageList`.
 */
type GroupType = "bubble" | "system-group";
type GroupRenderer = (group: MessageGroup, index: number) => ReactElement;

const GROUP_RENDERERS: Record<GroupType, GroupRenderer> = {
    bubble: (group) => <MessageBubble key={group.items[0].id} message={group.items[0]}/>,
    "system-group": (group, i) => <SystemMessageGroup key={`sys-${i}`} messages={group.items}/>,
};

export function registerGroupRenderer(type: GroupType, renderer: GroupRenderer): void {
    GROUP_RENDERERS[type] = renderer;
}

/**
 * Groups consecutive items by a key function.
 * Returns an array of {type, items} buckets the renderer registry knows how to render.
 */
function groupMessages(messages: Message[]): MessageGroup[] {
    const result: MessageGroup[] = [];
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
    const [expanded, setExpanded] = useState(false);
    const last = messages[messages.length - 1];
    const hasMore = messages.length > 1;

    return (
        <div className="flex flex-col items-center py-0.5">
            {expanded && hasMore && (
                <div className="space-y-0.5 mb-0.5">
                    {messages.slice(0, -1).map((m) => (
                        <p key={m.id} className="text-[10px] text-orchid-muted/50 italic text-center">
                            {m.content}
                        </p>
                    ))}
                </div>
            )}
            <div
                className={`flex items-center gap-1.5 ${hasMore ? "cursor-pointer" : ""}`}
                onClick={hasMore ? () => setExpanded(!expanded) : undefined}
            >
                <p className="text-[11px] text-orchid-muted/70 italic">
                    {last.content}
                </p>
                {hasMore && (
                    <ChevronDown
                        className={`h-3 w-3 text-orchid-muted/50 transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                )}
            </div>
        </div>
    );
}

/**
 * Scrollable message list — auto-scrolls to the latest message.
 * Consecutive system messages are grouped with only the last visible.
 */
export function MessageList({messages, isLoading}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, isLoading]);

    const groups = groupMessages(messages);

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

            {groups.map((group, i) => GROUP_RENDERERS[group.type](group, i))}

            {isLoading && <LoadingIndicator/>}

            <div ref={bottomRef}/>
        </div>
    );
}
