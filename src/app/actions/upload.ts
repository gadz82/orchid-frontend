"use server";

import {auth} from "@/lib/auth/auth";

const AGENTS_API_URL = process.env.AGENTS_API_URL ?? "http://localhost:8000";

export interface UploadResult {
    status: string;
    files: Array<{
        filename: string;
        chunks_indexed?: number;
        error?: string;
    }>;
    error?: string;
}

async function getServerToken(): Promise<string | undefined> {
    try {
        const {getToken} = await import("next-auth/jwt");
        const {cookies} = await import("next/headers");

        const cookieStore = await cookies();
        const secureCookie = process.env.NEXTAUTH_URL?.startsWith("https");
        const cookieName = secureCookie
            ? "__Secure-authjs.session-token"
            : "authjs.session-token";

        const cookie = cookieStore.get(cookieName);
        if (!cookie) return undefined;

        const token = await getToken({
            req: {
                cookies: Object.fromEntries(
                    cookieStore.getAll().map((c) => [c.name, c.value])
                ),
                headers: {},
            } as Parameters<typeof getToken>[0]["req"],
            secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
        });

        return token?.access_token as string | undefined;
    } catch {
        return undefined;
    }
}

/**
 * DEPRECATED: Use sendChatMessage() from chats.ts instead.
 */
export async function uploadFiles(
    chatId: string,
    formData: FormData
): Promise<UploadResult> {
    const session = await auth();
    if (!session) {
        return {status: "error", files: [], error: "Not authenticated"};
    }

    const token = await getServerToken();

    try {
        const res = await fetch(`${AGENTS_API_URL}/chats/${chatId}/upload`, {
            method: "POST",
            headers: {
                ...(token ? {Authorization: `Bearer ${token}`} : {}),
            },
            body: formData,
        });

        if (!res.ok) {
            const text = await res.text();
            return {status: "error", files: [], error: `API error ${res.status}: ${text}`};
        }

        return await res.json();
    } catch (err) {
        return {
            status: "error",
            files: [],
            error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
