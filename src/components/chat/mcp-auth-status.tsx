"use client";

import {useState, useEffect, useCallback} from "react";
import {
    Shield,
    CheckCircle,
    AlertCircle,
    Link2,
    Unlink,
    ChevronDown,
    ChevronUp,
    X,
} from "lucide-react";
import {
    listMCPAuthServers,
    getMCPAuthorizeUrl,
    revokeMCPToken,
} from "@/app/actions/mcp-auth";
import type {MCPServerAuthStatus} from "@/app/actions/mcp-auth";

/**
 * MCP OAuth server authorization status panel.
 *
 * Renders in the chat header.  Self-hides when no OAuth servers are
 * configured.  Handles the popup-based OAuth flow with ``postMessage``
 * for completion.
 *
 * Reacts to two events:
 *   - ``window`` "message" with ``type: "mcp-auth-complete"`` — popup
 *     signals a successful token exchange; the list is refreshed.
 *   - ``window`` "mcp-auth-needed" CustomEvent with ``detail.servers:
 *     string[]`` — the chat stream reports that the current turn hit
 *     unauthorized servers; the panel auto-expands and pulses the named
 *     rows so the user notices.
 *
 * When "Connect" fails (typically a YAML misconfiguration — ``auth.mode:
 * oauth`` with no ``authorization_endpoint`` or ``issuer``), the error
 * is shown inline instead of silently doing nothing.
 */
export function MCPAuthStatus() {
    const [servers, setServers] = useState<MCPServerAuthStatus[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);
    const [connectError, setConnectError] = useState<{server: string; message: string} | null>(null);
    const [highlighted, setHighlighted] = useState<Set<string>>(new Set());

    const refresh = useCallback(async () => {
        const data = await listMCPAuthServers();
        setServers(data);
    }, []);

    // Load on mount.  The setState is guarded behind ``await`` (so it
    // isn't synchronous with the effect body — satisfies the React 19
    // ``react-hooks/set-state-in-effect`` rule) and by a ``cancelled``
    // flag so a late response can't write to an unmounted component.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const data = await listMCPAuthServers();
            if (!cancelled) setServers(data);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Listen for postMessage from OAuth popup
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === "mcp-auth-complete") {
                setConnectError(null);
                refresh();
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [refresh]);

    // Listen for ``mcp-auth-needed`` dispatched by the chat stream when
    // the latest turn hit unauthorised MCP servers.  We auto-expand the
    // panel and temporarily highlight the affected rows so the user
    // doesn't have to hunt for the small header chip.
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
    }, [refresh]);

    // Fade the highlight after a short window so the pulse doesn't
    // linger forever once the user has seen it.
    useEffect(() => {
        if (highlighted.size === 0) return;
        const t = setTimeout(() => setHighlighted(new Set()), 6000);
        return () => clearTimeout(t);
    }, [highlighted]);

    const handleConnect = useCallback(async (serverName: string) => {
        setLoading(serverName);
        setConnectError(null);
        const result = await getMCPAuthorizeUrl(serverName);
        setLoading(null);
        if (result.kind === "ok") {
            window.open(result.url, `mcp-auth-${serverName}`, "width=600,height=700,popup=yes");
        } else {
            setConnectError({server: serverName, message: result.message});
            setExpanded(true);
        }
    }, []);

    const handleDisconnect = useCallback(async (serverName: string) => {
        setLoading(serverName);
        await revokeMCPToken(serverName);
        await refresh();
        setLoading(null);
    }, [refresh]);

    // Don't render if no OAuth servers configured
    if (servers.length === 0) return null;

    const unauthorizedCount = servers.filter((s) => !s.authorized).length;
    const allAuthorized = unauthorizedCount === 0;

    return (
        <div className="relative">
            {/* Compact trigger button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors
                    ${allAuthorized
                        ? "text-emerald-400 hover:bg-orchid-card"
                        : "text-amber-400 hover:bg-orchid-card"
                    }
                    ${highlighted.size > 0 && !allAuthorized ? "animate-pulse ring-1 ring-amber-400/60" : ""}`}
            >
                {allAuthorized ? (
                    <Shield className="h-3.5 w-3.5"/>
                ) : (
                    <AlertCircle className="h-3.5 w-3.5"/>
                )}
                <span className="hidden sm:inline">
                    {allAuthorized
                        ? `${servers.length} connected`
                        : `${unauthorizedCount} pending`}
                </span>
                {expanded ? (
                    <ChevronUp className="h-3 w-3"/>
                ) : (
                    <ChevronDown className="h-3 w-3"/>
                )}
            </button>

            {/* Expanded panel */}
            {expanded && (
                <div className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border
                    border-orchid-border bg-orchid-surface shadow-lg">
                    <div className="border-b border-orchid-border px-3 py-2">
                        <p className="text-xs font-semibold text-orchid-text">
                            External Services
                        </p>
                    </div>

                    {/* Inline error from a failed authorize request */}
                    {connectError && (
                        <div className="flex items-start gap-2 border-b border-orchid-border bg-amber-500/5 px-3 py-2">
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"/>
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-medium text-amber-400">
                                    Could not start sign-in for {connectError.server}
                                </p>
                                <p className="mt-0.5 break-words text-[10px] text-orchid-muted">
                                    {connectError.message}
                                </p>
                            </div>
                            <button
                                onClick={() => setConnectError(null)}
                                className="rounded p-0.5 text-orchid-muted hover:bg-orchid-card hover:text-orchid-text"
                                aria-label="Dismiss"
                            >
                                <X className="h-3 w-3"/>
                            </button>
                        </div>
                    )}

                    <div className="max-h-60 overflow-y-auto p-1.5">
                        {servers.map((server) => {
                            const isHighlighted = highlighted.has(server.server_name) && !server.authorized;
                            return (
                                <div
                                    key={server.server_name}
                                    className={`flex items-center justify-between rounded-md px-2.5 py-2
                                        hover:bg-orchid-card/50
                                        ${isHighlighted ? "animate-pulse bg-amber-500/10" : ""}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        {server.authorized ? (
                                            <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400"/>
                                        ) : (
                                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400"/>
                                        )}
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-medium text-orchid-text">
                                                {server.server_name}
                                            </p>
                                            <p className="truncate text-[10px] text-orchid-muted">
                                                {server.agent_names.join(", ")}
                                            </p>
                                        </div>
                                    </div>
                                    {server.authorized ? (
                                        <button
                                            onClick={() => handleDisconnect(server.server_name)}
                                            disabled={loading === server.server_name}
                                            className="flex items-center gap-1 rounded px-2 py-1 text-[10px]
                                                text-orchid-muted transition-colors hover:bg-orchid-card
                                                hover:text-red-400 disabled:opacity-50"
                                        >
                                            <Unlink className="h-3 w-3"/>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleConnect(server.server_name)}
                                            disabled={loading === server.server_name}
                                            className="flex items-center gap-1 rounded bg-orchid-accent/20 px-2 py-1
                                                text-[10px] font-medium text-orchid-accent transition-colors
                                                hover:bg-orchid-accent/30 disabled:opacity-50"
                                        >
                                            <Link2 className="h-3 w-3"/>
                                            <span>Connect</span>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
