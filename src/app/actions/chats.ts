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
    /**
     * Optional metadata block shipped by the backend (§25.5 of the
     * Pollen + Bloom spec).  When the backend writes a Bloom-
     * originated message it sets ``metadata.origin = "bloom"`` plus
     * ``bloom_run_id`` / ``trigger_id`` / ``signal_id`` so the
     * frontend can render the row with a distinct visual marker
     * linking back to ``/bloom/runs/{id}``.
     */
    metadata?: Record<string, unknown> | null;
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
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(`${AGENTS_API_URL}/chats`, {
            method: "POST",
            headers,
            body: JSON.stringify({title: title || ""}),
        });
    } catch (err) {
        console.error("[createChat] network error:", err);
        return null;
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) {
        const text = await res.text();
        console.error("[createChat] failed:", res.status, text);
        return null;
    }
    return await res.json();
}

export async function listChats(): Promise<ChatSession[]> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(`${AGENTS_API_URL}/chats`, {
            method: "GET",
            headers,
        });
    } catch {
        return [];
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) return [];
    return await res.json();
}

export async function loadMessages(chatId: string): Promise<ChatMessageOut[]> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/messages`, {
            method: "GET",
            headers,
        });
    } catch {
        return [];
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) return [];
    return await res.json();
}

export async function deleteChat(chatId: string): Promise<boolean> {
    let res: Response;
    try {
        const allHeaders = await getHeaders();
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(allHeaders)) {
            if (k !== "Content-Type") headers[k] = v;
        }
        res = await fetch(`${AGENTS_API_URL}/chats/${chatId}`, {
            method: "DELETE",
            headers,
        });
    } catch (err) {
        console.error("[deleteChat] network error:", err);
        return false;
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) {
        console.error("[deleteChat] failed:", res.status, await res.text());
    }
    return res.ok;
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

    let res: Response;
    try {
        const token = session.accessToken;
        const authHeaders: Record<string, string> = {
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        };

        const formData = new FormData();
        formData.append("message", message);

        if (fileData) {
            const files = fileData.getAll("files");
            for (const file of files) {
                formData.append("files", file);
            }
        }

        res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/messages`, {
            method: "POST",
            headers: authHeaders,
            body: formData,
        });
    } catch (err) {
        return {
            response: "",
            chatId,
            agentsUsed: [],
            error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

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
}

export async function shareChat(chatId: string): Promise<boolean> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/share`, {
            method: "POST",
            headers,
        });
    } catch {
        return false;
    }
    if (res.status === 401) await handleUnauthorized();
    return res.ok;
}
