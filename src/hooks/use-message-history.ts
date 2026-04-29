"use client";

import {useEffect, useState} from "react";

import {loadMessages} from "@/app/actions/chats";
import type {Message} from "@/components/chat/message-bubble";

interface UseMessageHistoryResult {
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    historyLoading: boolean;
}

/**
 * Owns the per-chat message-history state for the chat container.
 *
 * Loads messages whenever ``activeChatId`` changes; exposes a setter so
 * the parent can append the user's new message + the streaming
 * assistant message without needing direct access to the loader.
 */
export function useMessageHistory(activeChatId: string | undefined): UseMessageHistoryResult {
    const [messages, setMessages] = useState<Message[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    useEffect(() => {
        if (!activeChatId) return;
        let cancelled = false;
        const load = async () => {
            setHistoryLoading(true);
            const history = await loadMessages(activeChatId);
            if (cancelled) return;
            const msgs: Message[] = history.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                agentsUsed: m.agents_used,
                timestamp: new Date(m.created_at),
            }));
            setMessages(msgs);
            setHistoryLoading(false);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [activeChatId]);

    return {messages, setMessages, historyLoading};
}
