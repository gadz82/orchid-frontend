"use server";

import {auth} from "@/lib/auth/auth";

const AGENTS_API_URL = process.env.AGENTS_API_URL ?? "http://localhost:8000";

export interface ChatResult {
    response: string;
    agentsUsed: string[];
    error?: string;
}

/**
 * Server Action — proxy the user's chat message to the agents-api.
 *
 * DEPRECATED: Use sendChatMessage() from chats.ts instead.
 *
 * The OAuth access_token is read from the server-side JWT and forwarded
 * as a Bearer header. The browser never sees the raw token.
 */
export async function sendMessage(message: string): Promise<ChatResult> {
    const session = await auth();

    if (!session) {
        return {
            response: "",
            agentsUsed: [],
            error: "Not authenticated",
        };
    }

    const token = await getServerToken();

    try {
        const res = await fetch(`${AGENTS_API_URL}/chat`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(token ? {Authorization: `Bearer ${token}`} : {}),
            },
            body: JSON.stringify({message}),
        });

        if (!res.ok) {
            const text = await res.text();
            return {
                response: "",
                agentsUsed: [],
                error: `API error ${res.status}: ${text}`,
            };
        }

        const data = await res.json();
        return {
            response: data.response,
            agentsUsed: data.agents_used ?? [],
        };
    } catch (err) {
        return {
            response: "",
            agentsUsed: [],
            error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/**
 * Read the raw JWT access_token from the NextAuth cookie.
 * This is a server-only helper — the token never reaches the client.
 */
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
