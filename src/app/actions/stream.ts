"use server";

import {auth} from "@/lib/auth/auth";
import {AGENTS_API_URL} from "./_api-config";

// Browser-facing orchid-api URL.  In dev compose the server-side
// ``AGENTS_API_URL`` points at the Docker-internal hostname
// (e.g. ``http://agents-api:8000``) which the host-running browser
// cannot resolve.  ``NEXT_PUBLIC_AGENTS_API_URL`` overrides the
// URL handed to the client for the SSE streaming fetch only — every
// secret-bearing server-side call still uses ``AGENTS_API_URL``.
// Falls back to ``AGENTS_API_URL`` when unset (production / SSR-only
// deployments where the same URL is reachable from both sides).
const PUBLIC_AGENTS_API_URL =
    process.env.NEXT_PUBLIC_AGENTS_API_URL ?? AGENTS_API_URL;

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

    // Check if streaming is enabled on the server.  The capabilities
    // probe runs server-side so it goes through the Docker-internal
    // ``AGENTS_API_URL``; the URL we hand back to the browser is the
    // public one resolved above.
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
        url: PUBLIC_AGENTS_API_URL,
        headers: {
            ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        streamingEnabled,
    };
}
