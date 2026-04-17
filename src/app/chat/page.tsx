"use client";

import {SessionProvider} from "next-auth/react";
import {ChatContainer} from "@/components/chat/chat-container";
import {ChatListProvider} from "@/hooks/use-chat-list";

/**
 * Chat page — protected by middleware (requires auth).
 * Wraps ChatContainer with SessionProvider and ChatListProvider.
 */
export default function ChatPage() {
    return (
        <SessionProvider>
            <ChatListProvider>
                <ChatContainer />
            </ChatListProvider>
        </SessionProvider>
    );
}
