"use client";

import {createContext, useContext, useState, useCallback, useEffect, type ReactNode} from "react";
import {
    listChats,
    createChat,
    deleteChat,
    shareChat,
    type ChatSession,
} from "@/app/actions/chats";

/**
 * Shared chat list state — single source of truth for ChatContainer + ChatSidebar.
 *
 * Eliminates the double-fetch on mount and keeps both components in sync
 * when chats are created, deleted, or shared.
 */

interface ChatListContextValue {
    chats: ChatSession[];
    loading: boolean;
    activeChatId: string | null;
    setActiveChatId: (id: string | null) => void;
    refreshChats: () => Promise<void>;
    handleCreateChat: () => Promise<ChatSession | null>;
    handleDeleteChat: (chatId: string) => Promise<void>;
    handleShareChat: (chatId: string) => Promise<boolean>;
}

const ChatListContext = createContext<ChatListContextValue | null>(null);

export function ChatListProvider({children}: {children: ReactNode}) {
    const [chats, setChats] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);

    const refreshChats = useCallback(async () => {
        const result = await listChats();
        setChats(result);
        setLoading(false);
    }, []);

    // Load on mount
    useEffect(() => {
        refreshChats();
    }, [refreshChats]);

    const handleCreateChat = useCallback(async () => {
        const session = await createChat();
        if (session) {
            await refreshChats();
            setActiveChatId(session.id);
        }
        return session;
    }, [refreshChats]);

    const handleDeleteChat = useCallback(
        async (chatId: string) => {
            await deleteChat(chatId);
            await refreshChats();
            if (activeChatId === chatId) {
                const remaining = chats.filter((c) => c.id !== chatId);
                if (remaining.length > 0) {
                    setActiveChatId(remaining[0].id);
                } else {
                    await handleCreateChat();
                }
            }
        },
        [activeChatId, chats, refreshChats, handleCreateChat],
    );

    const handleShareChat = useCallback(
        async (chatId: string) => {
            const ok = await shareChat(chatId);
            if (ok) await refreshChats();
            return ok;
        },
        [refreshChats],
    );

    return (
        <ChatListContext.Provider
            value={{
                chats,
                loading,
                activeChatId,
                setActiveChatId,
                refreshChats,
                handleCreateChat,
                handleDeleteChat,
                handleShareChat,
            }}
        >
            {children}
        </ChatListContext.Provider>
    );
}

export function useChatList(): ChatListContextValue {
    const ctx = useContext(ChatListContext);
    if (!ctx) {
        throw new Error("useChatList must be used within a ChatListProvider");
    }
    return ctx;
}
