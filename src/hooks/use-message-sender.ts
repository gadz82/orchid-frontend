"use client";

import {signOut} from "next-auth/react";
import {useCallback, useState} from "react";

import type {Message} from "@/components/chat/message-bubble";
import {useChatStream} from "@/hooks/use-chat-stream";

interface UseMessageSenderArgs {
    activeChatId: string | undefined;
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

interface UseMessageSenderResult {
    handleSend: (text: string, files: File[]) => Promise<void>;
    isLoading: boolean;
    uploading: boolean;
}

/**
 * Drives the streaming send flow that used to live inline in
 * :func:`ChatContainer.handleSend`.
 *
 * Owns the ``isLoading`` / ``uploading`` flags and the long set of
 * ``useChatStream`` callbacks that mutate the message list as tokens,
 * status events, and handoffs arrive. The caller passes its
 * ``setMessages`` setter so the hook can splice into the same state
 * the component renders.
 */
export function useMessageSender({
    activeChatId,
    setMessages,
}: UseMessageSenderArgs): UseMessageSenderResult {
    const [isLoading, setIsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const {streamMessage} = useChatStream();

    const handleSend = useCallback(
        async (text: string, files: File[]) => {
            if (!activeChatId) return;

            const fileNames = files.map((f) => f.name);
            const displayContent =
                fileNames.length > 0 ? `${text}\n\n_Attached: ${fileNames.join(", ")}_` : text;

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
                await streamMessage(activeChatId, text, files.length > 0 ? files : null, {
                    onToken: (token) => {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantId ? {...m, content: m.content + token} : m,
                            ),
                        );
                    },
                    onStatus: (agent, agentStatus, preview) => {
                        let content: string;
                        if (agentStatus === "started") {
                            content = `${agent} agent activated`;
                        } else if (agentStatus === "done" && preview) {
                            const short =
                                preview.length > 150 ? preview.slice(0, 150) + "…" : preview;
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
                    onDone: (response, agentsUsed, authRequired) => {
                        setMessages((prev) =>
                            prev.map((m) =>
                                m.id === assistantId
                                    ? {...m, content: response || m.content, agentsUsed}
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
                });
            } catch {
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === assistantId
                            ? {
                                  ...m,
                                  content:
                                      m.content ||
                                      "Sorry, something went wrong. Please try again.",
                              }
                            : m,
                    ),
                );
            } finally {
                setIsLoading(false);
                setUploading(false);
            }
        },
        [activeChatId, setMessages, streamMessage],
    );

    return {handleSend, isLoading, uploading};
}
