"use server";

import {auth} from "@/lib/auth/auth";
import {AGENTS_API_URL} from "./_api-config";

/**
 * Returns the streaming endpoint URL and auth headers.
 *
 * Server Action — runs on the server so the access token never reaches
 * the browser. The client uses these to open a direct fetch stream.
 */
export async function getStreamConfig(): Promise<{
    url: string;
    headers: Record<string, string>;
    streamingEnabled: boolean;
}> {
    const session = await auth();
    const token = session?.accessToken;

    // Check if streaming is enabled on the server
    let streamingEnabled = true;
    try {
        const res = await fetch(`${AGENTS_API_URL}/chats/capabilities`, {
            headers: token ? {Authorization: `Bearer ${token}`} : {},
        });
        if (res.ok) {
            const data = await res.json();
            streamingEnabled = data.streaming_enabled ?? true;
        }
    } catch {
        // Default to enabled if capabilities check fails
    }

    return {
        url: AGENTS_API_URL,
        headers: {
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        streamingEnabled,
    };
}
