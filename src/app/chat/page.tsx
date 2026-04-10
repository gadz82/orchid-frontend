"use client";

import {SessionProvider} from "next-auth/react";
import {ChatContainer} from "@/components/chat/chat-container";

/**
 * Chat page — protected by middleware (requires auth).
 * Wraps ChatContainer with NextAuth SessionProvider.
 */
export default function ChatPage() {
    return (
        <SessionProvider>
            <ChatContainer/>
        </SessionProvider>
    );
}
