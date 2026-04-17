"use client";

import {useCallback} from "react";
import {Plus, Trash2, Share2, MessageSquare, PanelLeftClose, PanelLeft} from "lucide-react";
import {useChatList} from "@/hooks/use-chat-list";

interface ChatSidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function ChatSidebar({collapsed, onToggle}: ChatSidebarProps) {
    const {
        chats,
        loading,
        activeChatId,
        setActiveChatId,
        handleCreateChat,
        handleDeleteChat,
        handleShareChat,
    } = useChatList();

    const onNewChat = useCallback(async () => {
        await handleCreateChat();
    }, [handleCreateChat]);

    const onDelete = useCallback(
        async (e: React.MouseEvent, chatId: string) => {
            e.stopPropagation();
            if (!confirm("Delete this chat?")) return;
            await handleDeleteChat(chatId);
        },
        [handleDeleteChat],
    );

    const onShare = useCallback(
        async (e: React.MouseEvent, chatId: string) => {
            e.stopPropagation();
            if (!confirm("Share this chat's knowledge to your personal library?")) return;
            await handleShareChat(chatId);
        },
        [handleShareChat],
    );

    if (collapsed) {
        return (
            <div className="flex h-full w-12 flex-col items-center border-r border-orchid-border bg-orchid-surface py-3">
                <button
                    onClick={onToggle}
                    className="rounded-lg p-2 text-orchid-muted hover:bg-orchid-card hover:text-orchid-text"
                    aria-label="Expand sidebar"
                >
                    <PanelLeft className="h-4 w-4" />
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full w-64 flex-col border-r border-orchid-border bg-orchid-surface">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-orchid-border px-3 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-orchid-muted">
                    Chats
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onNewChat}
                        className="rounded-lg p-1.5 text-orchid-muted hover:bg-orchid-card hover:text-orchid-text"
                        aria-label="New chat"
                    >
                        <Plus className="h-4 w-4" />
                    </button>
                    <button
                        onClick={onToggle}
                        className="rounded-lg p-1.5 text-orchid-muted hover:bg-orchid-card hover:text-orchid-text"
                        aria-label="Collapse sidebar"
                    >
                        <PanelLeftClose className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {loading ? (
                    <p className="px-2 py-4 text-center text-xs text-orchid-muted">Loading...</p>
                ) : chats.length === 0 ? (
                    <p className="px-2 py-4 text-center text-xs text-orchid-muted">No chats yet</p>
                ) : (
                    <ul className="space-y-1">
                        {chats.map((chat) => (
                            <li key={chat.id}>
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setActiveChatId(chat.id)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") setActiveChatId(chat.id);
                                    }}
                                    className={`group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                        activeChatId === chat.id
                                            ? "bg-orchid-accent/15 text-orchid-text font-medium"
                                            : "text-orchid-muted hover:bg-orchid-card hover:text-orchid-text"
                                    }`}
                                >
                                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                                    <span className="flex-1 truncate">{chat.title}</span>

                                    {/* Action buttons — visible on hover */}
                                    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                                        {!chat.is_shared && (
                                            <button
                                                onClick={(e) => onShare(e, chat.id)}
                                                className="rounded p-1 text-orchid-muted hover:text-blue-400"
                                                aria-label="Share chat"
                                                title="Share to personal library"
                                            >
                                                <Share2 className="h-3 w-3" />
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => onDelete(e, chat.id)}
                                            className="rounded p-1 text-orchid-muted hover:text-red-400"
                                            aria-label="Delete chat"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </span>

                                    {/* Shared badge */}
                                    {chat.is_shared && (
                                        <span className="shrink-0 rounded bg-orchid-accent/15 px-1 py-0.5 text-[10px] font-medium text-orchid-accent-glow group-hover:hidden">
                                            Shared
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
