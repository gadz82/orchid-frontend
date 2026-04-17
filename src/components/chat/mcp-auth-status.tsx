"use client";

import {useState, useEffect, useCallback} from "react";
import {Shield, CheckCircle, AlertCircle, Link2, Unlink, ChevronDown, ChevronUp} from "lucide-react";
import {
    listMCPAuthServers,
    getMCPAuthorizeUrl,
    revokeMCPToken,
} from "@/app/actions/mcp-auth";
import type {MCPServerAuthStatus} from "@/app/actions/mcp-auth";

/**
 * MCP OAuth server authorization status panel.
 *
 * Renders in the chat header. Self-hides when no OAuth servers are configured.
 * Handles the popup-based OAuth flow with postMessage for completion.
 */
export function MCPAuthStatus() {
    const [servers, setServers] = useState<MCPServerAuthStatus[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);

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
                refresh();
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [refresh]);

    const handleConnect = useCallback(async (serverName: string) => {
        setLoading(serverName);
        const url = await getMCPAuthorizeUrl(serverName);
        setLoading(null);
        if (url) {
            window.open(url, `mcp-auth-${serverName}`, "width=600,height=700,popup=yes");
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
                    }`}
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
                <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-lg border
                    border-orchid-border bg-orchid-surface shadow-lg">
                    <div className="border-b border-orchid-border px-3 py-2">
                        <p className="text-xs font-semibold text-orchid-text">
                            External Services
                        </p>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1.5">
                        {servers.map((server) => (
                            <div
                                key={server.server_name}
                                className="flex items-center justify-between rounded-md px-2.5 py-2
                                    hover:bg-orchid-card/50"
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
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
