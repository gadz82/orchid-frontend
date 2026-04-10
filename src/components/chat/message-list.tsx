"use client";

import {useEffect, useRef} from "react";
import {MessageBubble, type Message} from "./message-bubble";
import {LoadingIndicator} from "./loading-indicator";
import {OrchidIcon} from "@/components/icons/orchid-icon";

interface MessageListProps {
    messages: Message[];
    isLoading: boolean;
}

/**
 * Scrollable message list — auto-scrolls to the latest message.
 */
export function MessageList({messages, isLoading}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth"});
    }, [messages, isLoading]);

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

            {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg}/>
            ))}

            {isLoading && <LoadingIndicator/>}

            <div ref={bottomRef}/>
        </div>
    );
}
