"use client";

import {useState, useCallback, useEffect, useRef} from "react";
import {useSession, signOut} from "next-auth/react";
import {useRouter} from "next/navigation";
import {LogOut, User, Upload} from "lucide-react";
import {OrchidIcon} from "@/components/icons/orchid-icon";

import {MessageList} from "./message-list";
import {ChatInput} from "./chat-input";
import {ChatSidebar} from "./chat-sidebar";
import {MCPAuthStatus} from "./mcp-auth-status";
import type {Message} from "./message-bubble";
import {
    sendChatMessage,
    loadMessages,
    createChat,
    listChats,
} from "@/app/actions/chats";
import {useChatStream} from "@/hooks/use-chat-stream";

/**
 * Main chat container — multi-chat with sidebar and persistent history.
 */
export function ChatContainer() {
    const {data: session, status} = useSession();
    const router = useRouter();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
    const dragCounterRef = useRef(0);

    // Redirect to login if session is not available
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
    }, [status, router]);

    // On mount: load chats, select or create the first one
    useEffect(() => {
        const init = async () => {
            try {
                const chats = await listChats();
                if (chats.length > 0) {
                    setActiveChatId(chats[0].id);
                } else {
                    const newChat = await createChat();
                    if (newChat) {
                        setActiveChatId(newChat.id);
                    }
                }
            } catch (error) {
                console.error("Failed to load chats:", error);
            }
        };
        init();
    }, []);

    // Load messages when active chat changes
    useEffect(() => {
        if (!activeChatId) return;
        const load = async () => {
            setHistoryLoading(true);
            const history = await loadMessages(activeChatId);
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
    }, [activeChatId]);

    const {streamMessage} = useChatStream();

    const handleSend = useCallback(
        async (text: string, files: File[]) => {
            if (!activeChatId) return;

            const fileNames = files.map((f) => f.name);
            const displayContent =
                fileNames.length > 0
                    ? `${text}\n\n_Attached: ${fileNames.join(", ")}_`
                    : text;

            const userMsg: Message = {
                id: crypto.randomUUID(),
                role: "user",
                content: displayContent,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, userMsg]);
            setIsLoading(true);
            if (files.length > 0) setUploading(true);

            // Create an empty assistant message that will be filled by streaming
            const assistantId = crypto.randomUUID();
            const assistantMsg: Message = {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);

            try {
                await streamMessage(
                    activeChatId,
                    text,
                    files.length > 0 ? files : null,
                    {
                        onToken: (token) => {
                            // Append token to the streaming assistant message
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === assistantId
                                        ? {...m, content: m.content + token}
                                        : m,
                                ),
                            );
                        },
                        onStatus: (agent, status, preview) => {
                            let content: string;
                            if (status === "started") {
                                content = `${agent} agent activated`;
                            } else if (status === "done" && preview) {
                                // Truncate preview for system message display
                                const short = preview.length > 150
                                    ? preview.slice(0, 150) + "…"
                                    : preview;
                                content = `${agent}: ${short}`;
                            } else {
                                return;  // skip unknown statuses
                            }
                            const statusMsg: Message = {
                                id: crypto.randomUUID(),
                                role: "system",
                                content,
                                timestamp: new Date(),
                            };
                            setMessages((prev) => {
                                const last = prev[prev.length - 1];
                                return [...prev.slice(0, -1), statusMsg, last];
                            });
                        },
                        onAgentResult: () => {
                            // Agent results are now included in the done event
                        },
                        onHandoff: (content) => {
                            const handoffMsg: Message = {
                                id: crypto.randomUUID(),
                                role: "system",
                                content,
                                timestamp: new Date(),
                            };
                            setMessages((prev) => {
                                const last = prev[prev.length - 1];
                                return [...prev.slice(0, -1), handoffMsg, last];
                            });
                        },
                        onDone: (response, agentsUsed, _authRequired) => {
                            // Finalize the message with agents and ensure content is complete
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === assistantId
                                        ? {...m, content: response || m.content, agentsUsed}
                                        : m,
                                ),
                            );
                        },
                        onError: (error) => {
                            if (error.includes("Not authenticated")) {
                                signOut({callbackUrl: "/login"});
                                return;
                            }
                            // Update the streaming message with the error
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === assistantId
                                        ? {...m, content: m.content || `Error: ${error}`}
                                        : m,
                                ),
                            );
                        },
                    },
                );
            } catch {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {...m, content: m.content || "Sorry, something went wrong. Please try again."}
                            : m,
                    ),
                );
            } finally {
                setIsLoading(false);
                setUploading(false);
            }
        },
        [activeChatId, streamMessage],
    );

    const ACCEPTED_TYPES = new Set([
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "text/plain",
        "text/markdown",
        "image/png",
        "image/jpeg",
    ]);
    const ACCEPTED_EXTENSIONS = new Set([
        ".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md", ".png", ".jpg", ".jpeg",
    ]);

    const isAcceptedFile = useCallback((file: File) => {
        if (ACCEPTED_TYPES.has(file.type)) return true;
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        return ACCEPTED_EXTENSIONS.has(ext);
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        if (e.dataTransfer.types.includes("Files")) {
            setDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current -= 1;
        if (dragCounterRef.current === 0) {
            setDragOver(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            dragCounterRef.current = 0;
            setDragOver(false);

            if (!activeChatId || uploading) return;

            const accepted = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
            if (accepted.length > 0) {
                setDroppedFiles((prev) => [...prev, ...accepted]);
            }
        },
        [activeChatId, uploading, isAcceptedFile]
    );

    const handleSelectChat = (chatId: string) => {
        setActiveChatId(chatId);
    };

    const handleNewChat = (chatId: string) => {
        setActiveChatId(chatId);
        setMessages([]);
    };

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
            {/* Sidebar */}
            <ChatSidebar
                activeChatId={activeChatId}
                onSelectChat={handleSelectChat}
                onNewChat={handleNewChat}
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Main chat area */}
            <div
                className="relative flex flex-1 flex-col"
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Drag-and-drop overlay */}
                {dragOver && (
                    <div
                        className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-orchid-accent/5 backdrop-blur-[2px]">
                        <div
                            className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-orchid-accent bg-orchid-card/95 px-12 py-10 shadow-glow">
                            <Upload className="h-10 w-10 text-orchid-accent"/>
                            <p className="text-sm font-semibold text-orchid-text">
                                Drop files to upload
                            </p>
                            <p className="text-xs text-orchid-muted">
                                PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPG
                            </p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header
                    className="flex items-center justify-between border-b border-orchid-border bg-orchid-surface/50 px-4 py-3 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-orchid-accent/15">
                            <OrchidIcon size={22} className="text-orchid-accent-glow"/>
                        </div>
                        <h1 className="text-sm font-bold text-orchid-text">Orchid</h1>
                    </div>

                    {/* MCP auth status + User info + logout */}
                    <div className="flex items-center gap-3">
                        <MCPAuthStatus />
                        {session?.user?.name && (
                            <div className="flex items-center gap-2 text-sm text-orchid-muted">
                                <User className="h-4 w-4 text-orchid-muted"/>
                                <span className="hidden sm:inline">{session.user.name}</span>
                            </div>
                        )}
                        <button
                            onClick={() => signOut({callbackUrl: "/login"})}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs
                         text-orchid-muted transition-colors hover:bg-orchid-card
                         hover:text-orchid-text"
                        >
                            <LogOut className="h-3.5 w-3.5 text-orchid-muted"/>
                            <span className="hidden sm:inline">Sign out</span>
                        </button>
                    </div>
                </header>

                {/* Messages */}
                {historyLoading ? (
                    <div className="flex flex-1 items-center justify-center">
                        <p className="text-sm text-orchid-muted">Loading history...</p>
                    </div>
                ) : (
                    <MessageList messages={messages} isLoading={isLoading}/>
                )}

                {/* Input */}
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
