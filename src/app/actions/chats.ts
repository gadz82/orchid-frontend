"use server";

import {auth} from "@/lib/auth/auth";
import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

// ── Types ──────────────────────────────────────────────────

export interface ChatSession {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    is_shared: boolean;
}

export interface ChatMessageOut {
    id: string;
    role: string;
    content: string;
    agents_used: string[];
    created_at: string;
}

export interface ChatResult {
    response: string;
    chatId: string;
    agentsUsed: string[];
    error?: string;
    authRequired?: string[];
}

// ── CRUD ────────────────────────────────────────────────────

export async function createChat(title?: string): Promise<ChatSession | null> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/chats`, {
            method: "POST",
            headers,
            body: JSON.stringify({title: title || ""}),
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) {
            const text = await res.text();
            console.error("[createChat] failed:", res.status, text);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error("[createChat] error:", err);
        return null;
    }
}

export async function listChats(): Promise<ChatSession[]> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/chats`, {
            method: "GET",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function loadMessages(chatId: string): Promise<ChatMessageOut[]> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/messages`, {
            method: "GET",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function deleteChat(chatId: string): Promise<boolean> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/chats/${chatId}`, {
            method: "DELETE",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        return res.ok;
    } catch {
        return false;
    }
}

export async function sendChatMessage(
    chatId: string,
    message: string,
    fileData?: FormData
): Promise<ChatResult> {
    const session = await auth();
    if (!session) {
        return {
            response: "",
            chatId,
            agentsUsed: [],
            error: "Not authenticated",
        };
    }

    try {
        const token = session.accessToken;
        const authHeaders: Record<string, string> = {
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        };

        // Build multipart form (message + optional files)
        const formData = new FormData();
        formData.append("message", message);

        if (fileData) {
            const files = fileData.getAll("files");
            for (const file of files) {
                formData.append("files", file);
            }
        }

        const res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/messages`, {
            method: "POST",
            headers: authHeaders, // No Content-Type — browser sets multipart boundary
            body: formData,
        });

        if (res.status === 401) await handleUnauthorized();

        if (!res.ok) {
            const text = await res.text();
            return {
                response: "",
                chatId,
                agentsUsed: [],
                error: `API error ${res.status}: ${text}`,
            };
        }

        const data = await res.json();
        return {
            response: data.response,
            chatId: data.chat_id ?? chatId,
            agentsUsed: data.agents_used ?? [],
            authRequired: data.auth_required ?? [],
        };
    } catch (err) {
        return {
            response: "",
            chatId,
            agentsUsed: [],
            error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

export async function shareChat(chatId: string): Promise<boolean> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/share`, {
            method: "POST",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        return res.ok;
    } catch {
        return false;
    }
}
