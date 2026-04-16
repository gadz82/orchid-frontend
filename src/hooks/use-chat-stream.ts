"use client";

import {useCallback, useRef} from "react";
import {getStreamConfig} from "@/app/actions/stream";

export interface StreamCallbacks {
    onToken: (token: string) => void;
    onStatus: (agent: string, status: string) => void;
    onAgentResult: (agent: string, content: string) => void;
    onHandoff: (content: string) => void;
    onDone: (response: string, agentsUsed: string[], authRequired: string[]) => void;
    onError: (error: string) => void;
}

/**
 * Hook for streaming chat messages via SSE.
 *
 * Returns a `streamMessage` function that opens a fetch stream to the
 * `/chats/{id}/messages/stream` endpoint and calls the provided callbacks
 * as events arrive.
 */
export function useChatStream() {
    const abortRef = useRef<AbortController | null>(null);

    const streamMessage = useCallback(
        async (
            chatId: string,
            message: string,
            files: File[] | null,
            callbacks: StreamCallbacks,
        ) => {
            // Cancel any in-flight stream
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            try {
                const {url, headers} = await getStreamConfig();

                // Build multipart form
                const formData = new FormData();
                formData.append("message", message);
                if (files) {
                    for (const file of files) {
                        formData.append("files", file);
                    }
                }

                const response = await fetch(
                    `${url}/chats/${chatId}/messages/stream`,
                    {
                        method: "POST",
                        headers, // No Content-Type — browser sets multipart boundary
                        body: formData,
                        signal: controller.signal,
                    },
                );

                if (!response.ok) {
                    const text = await response.text();
                    callbacks.onError(`API error ${response.status}: ${text}`);
                    return;
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    callbacks.onError("No response body");
                    return;
                }

                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, {stream: true});

                    // Parse SSE events (format: "data: {...}\n\n")
                    const lines = buffer.split("\n\n");
                    buffer = lines.pop() || ""; // keep incomplete last chunk

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith("data: ")) continue;

                        try {
                            const data = JSON.parse(trimmed.slice(6));

                            switch (data.type) {
                                case "token":
                                    callbacks.onToken(data.content || "");
                                    break;
                                case "status":
                                    callbacks.onStatus(data.agent || "", data.status || "");
                                    break;
                                case "done":
                                    callbacks.onDone(
                                        data.response || "",
                                        data.agents_used || [],
                                        data.auth_required || [],
                                    );
                                    break;
                                case "agent_result":
                                    callbacks.onAgentResult(data.agent || "", data.content || "");
                                    break;
                                case "handoff":
                                    callbacks.onHandoff(data.content || "");
                                    break;
                                case "error":
                                    callbacks.onError(data.message || "Unknown error");
                                    break;
                            }
                        } catch {
                            // Skip malformed events
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).name === "AbortError") return;
                callbacks.onError(
                    `Stream error: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
        },
        [],
    );

    const cancelStream = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    return {streamMessage, cancelStream};
}
