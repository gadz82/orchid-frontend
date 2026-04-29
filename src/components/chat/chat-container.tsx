"use client";

import {useEffect, useState} from "react";
import {useSession} from "next-auth/react";
import {useRouter} from "next/navigation";
import {Upload} from "lucide-react";

import {MessageList} from "./message-list";
import {ChatInput} from "./chat-input";
import {ChatSidebar} from "./chat-sidebar";
import {ChatHeader} from "./chat-header";
import {useChatList} from "@/hooks/use-chat-list";
import {useDragDrop} from "@/hooks/use-drag-drop";
import {useMessageHistory} from "@/hooks/use-message-history";
import {useMessageSender} from "@/hooks/use-message-sender";

/**
 * Main chat container — multi-chat with sidebar and persistent history.
 *
 * Composition root for three hooks:
 *   - :func:`useChatList` — chat CRUD + active selection (shared with sidebar).
 *   - :func:`useMessageHistory` — per-chat message state + load on switch.
 *   - :func:`useMessageSender` — streaming send flow + upload spinner.
 *
 * Drag-and-drop and the OAuth redirect both live in dedicated hooks so
 * this component stays focused on layout.
 */
export function ChatContainer() {
    const {status} = useSession();
    const router = useRouter();
    const {activeChatId, setActiveChatId, chats, loading: chatsLoading, handleCreateChat} =
        useChatList();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const {messages, setMessages, historyLoading} = useMessageHistory(activeChatId);
    const {handleSend, isLoading, uploading} = useMessageSender({activeChatId, setMessages});
    const {dragOver, droppedFiles, setDroppedFiles, dragHandlers} = useDragDrop({
        disabled: !activeChatId || uploading,
    });

    // Redirect to login if session is not available
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // On mount: select first chat or create one (once chat list is loaded)
    useEffect(() => {
        if (chatsLoading || activeChatId) return;
        if (chats.length > 0) {
            setActiveChatId(chats[0].id);
        } else {
            handleCreateChat();
        }
    }, [chatsLoading, chats, activeChatId, setActiveChatId, handleCreateChat]);

    if (status === "loading") {
        return (
            <div className="flex h-screen items-center justify-center bg-orchid-bg">
                <p className="text-sm text-orchid-muted">Loading...</p>
            </div>
        );
    }

    if (status === "unauthenticated") {
        return null;
    }

    return (
        <div className="flex h-screen bg-orchid-bg">
            <ChatSidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            <div className="relative flex flex-1 flex-col" {...dragHandlers}>
                {dragOver && (
                    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-orchid-accent/5 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-orchid-accent bg-orchid-card/95 px-12 py-10 shadow-glow">
                            <Upload className="h-10 w-10 text-orchid-accent" />
                            <p className="text-sm font-semibold text-orchid-text">Drop files to upload</p>
                            <p className="text-xs text-orchid-muted">PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPG</p>
                        </div>
                    </div>
                )}

                <ChatHeader />

                {historyLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-sm text-orchid-muted">Loading history...</p>
                    </div>
                ) : (
                    <MessageList messages={messages} isLoading={isLoading} />
                )}

                <ChatInput
                    onSend={handleSend}
                    disabled={isLoading || !activeChatId}
                    uploading={uploading}
                    externalFiles={droppedFiles}
                    onExternalFilesChange={setDroppedFiles}
                />
            </div>
        </div>
    );
}
