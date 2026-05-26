"use client";

import {useState, useCallback, useEffect} from "react";
import {useSession, signOut} from "next-auth/react";
import {useRouter} from "next/navigation";
import {Upload} from "lucide-react";

import {MessageList} from "./message-list";
import {ChatInput} from "./chat-input";
import {ChatSidebar} from "./chat-sidebar";
import {ChatHeader} from "./chat-header";
import type {Message} from "./message-bubble";
import {loadMessages} from "@/app/actions/chats";
import {cancelRun} from "@/app/actions/bloom-runs";
import {useChatStream} from "@/hooks/use-chat-stream";
import {useChatEvents} from "@/hooks/use-chat-events";
import {useDragDrop} from "@/hooks/use-drag-drop";
import {useChatList} from "@/hooks/use-chat-list";

/**
 * Main chat container — multi-chat with sidebar and persistent history.
 *
 * Chat list state is shared with ChatSidebar via ChatListContext (useChatList).
 * Delegates drag-and-drop to useDragDrop, streaming to useChatStream,
 * and the header to ChatHeader.
 */
export function ChatContainer() {
    const {status} = useSession();
    const router = useRouter();
    const {activeChatId, setActiveChatId, chats, loading: chatsLoading, handleCreateChat} = useChatList();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [uploading, setUploading] = useState(false);

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
                cancelled: (m.metadata?.cancelled as boolean) ?? false,
                timestamp: new Date(m.created_at),
            }));
            setMessages(msgs);
            setHistoryLoading(false);
        };
        load();
    }, [activeChatId]);

    const {streamMessage, cancelStream} = useChatStream();

    // Phase F2.5 — long-lived chat-events SSE subscription that
    // surfaces in-flight Bloom progress as inline cards under the
    // originating message.  The two streams are independent:
    // ``useChatStream`` is per-request, ``useChatEvents`` is
    // per-chat-session and reconnects on its own.
    const {blooms: bloomProgress} = useChatEvents(activeChatId);
    const handleCancelBloom = useCallback(
        async (runId: string) => {
            await cancelRun(runId);
        },
        [],
    );

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
                             setMessages((prev) =>
                                 prev.map((m) =>
                                     m.id === assistantId
                                         ? {...m, content: m.content + token}
                                         : m,
                                 ),
                             );
                         },
                         onStatus: (agent, agentStatus, preview) => {
                             let content: string;
                             if (agentStatus === "started") {
                                 content = `${agent} agent activated`;
                             } else if (agentStatus === "done" && preview) {
                                 const trimmed = preview.trim();
                                 const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
                                 const short = looksLikeJson
                                     ? "completed"
                                     : (preview.length > 150 ? preview.slice(0, 150) + "\u2026" : preview);
                                 content = `${agent}: ${short}`;
                             } else {
                                 return;
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
                         onAgentResult: () => {},
                         onActivity: (event) => {
                             let content: string;
                             if (event.type === "tool.started") {
                                 content = `${event.agent} → using tool: ${event.tool}`;
                             } else if (event.type === "tool.finished") {
                                 content = `${event.agent} → tool ${event.tool} completed`;
                             } else if (event.type === "skill.adopted") {
                                 content = `${event.agent} adopted skill: ${event.skill}`;
                             } else {
                                 return;
                             }
                             const activityMsg: Message = {
                                 id: crypto.randomUUID(),
                                 role: "system",
                                 content,
                                 timestamp: new Date(),
                             };
                             setMessages((prev) => {
                                 const last = prev[prev.length - 1];
                                 return [...prev.slice(0, -1), activityMsg, last];
                             });
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
                        onDone: (response, agentsUsed, authRequired, cancelled) => {
                            setMessages((prev) =>
                                prev.map((m) =>
                                    m.id === assistantId
                                        ? {
                                              ...m,
                                              content: response || m.content,
                                              agentsUsed,
                                              cancelled: cancelled || m.cancelled,
                                          }
                                        : m,
                                ),
                            );
                             // Surface unauthorised MCP servers to the
                             // header chip so it auto-expands and pulses.
                             if (authRequired && authRequired.length > 0) {
                                 window.dispatchEvent(
                                     new CustomEvent("mcp-auth-needed", {
                                         detail: {servers: authRequired},
                                     }),
                                 );
                             }
                         },
                         onError: (error) => {
                             if (error.includes("Not authenticated")) {
                                 signOut({callbackUrl: "/login"});
                                 return;
                             }
                             setMessages((prev) =>
                                 prev.map((m) =>
                                     m.id === assistantId
                                         ? {...m, content: m.content || `Error: ${error}`}
                                         : m,
                                 ),
                             );
                         },
                         onCancel: () => {
                             setMessages((prev) =>
                                 prev.map((m) =>
                                     m.id === assistantId
                                         ? {
                                               ...m,
                                               content: m.content || "_Execution cancelled._",
                                               cancelled: true,
                                           }
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
                    <MessageList
                        messages={messages}
                        isLoading={isLoading}
                        blooms={bloomProgress}
                        onCancelBloom={handleCancelBloom}
                    />
                )}

                <ChatInput
                    onSend={handleSend}
                    onCancel={cancelStream}  // NEW — directly wires to the hook
                    isLoading={isLoading}
                    disabled={isLoading || !activeChatId}
                    uploading={uploading}
                    externalFiles={droppedFiles}
                    onExternalFilesChange={setDroppedFiles}
                />
            </div>
        </div>
    );
}
