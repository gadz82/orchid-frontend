"use client";

import {useEffect, useState} from "react";

interface UseMCPAuthHighlightArgs {
    refresh: () => Promise<void>;
    setExpanded: (expanded: boolean) => void;
    onAuthComplete: () => void;
}

interface UseMCPAuthHighlightResult {
    highlighted: Set<string>;
}

/**
 * Reacts to two ``window`` events:
 *
 *   - ``"message"`` with ``type: "mcp-auth-complete"`` — the OAuth
 *     popup signals success; the panel refreshes the server list and
 *     clears any inline error via ``onAuthComplete``.
 *   - ``"mcp-auth-needed"`` (CustomEvent with ``detail.servers``) —
 *     the chat stream reports that the latest turn hit unauthorised
 *     servers; the panel auto-expands and pulses the named rows.
 *
 * The pulse fades after 6 s so it doesn't linger forever.
 */
export function useMCPAuthHighlight({
    refresh,
    setExpanded,
    onAuthComplete,
}: UseMCPAuthHighlightArgs): UseMCPAuthHighlightResult {
    const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === "mcp-auth-complete") {
                onAuthComplete();
                refresh();
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [refresh, onAuthComplete]);

    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<{servers?: string[]}>).detail;
            const names = detail?.servers?.filter(Boolean) ?? [];
            if (names.length === 0) return;
            setExpanded(true);
            setHighlighted(new Set(names));
            refresh();
        };
        window.addEventListener("mcp-auth-needed", handler as EventListener);
        return () => window.removeEventListener("mcp-auth-needed", handler as EventListener);
    }, [refresh, setExpanded]);

    useEffect(() => {
        if (highlighted.size === 0) return;
        const t = setTimeout(() => setHighlighted(new Set()), 6000);
        return () => clearTimeout(t);
    }, [highlighted]);

    return {highlighted};
}
