"use client";

import {useCallback, useState} from "react";
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

import {useMCPAuthFlow} from "@/hooks/use-mcp-auth-flow";
import {useMCPAuthHighlight} from "@/hooks/use-mcp-auth-highlight";
import {useMCPAuthServers} from "@/hooks/use-mcp-auth-servers";

/**
 * MCP OAuth server authorization status panel.
 *
 * Renders in the chat header.  Self-hides when no OAuth servers are
 * configured.  Composes three hooks that own the underlying state:
 *
 *   - :func:`useMCPAuthServers` — server list + refresh.
 *   - :func:`useMCPAuthHighlight` — popup completion + auth-needed
 *     highlight pulse via window events.
 *   - :func:`useMCPAuthFlow` — connect / disconnect actions and the
 *     inline error surfaced when authorize-URL fetch fails.
 */
export function MCPAuthStatus() {
    const [expanded, setExpanded] = useState(false);
    const {servers, refresh} = useMCPAuthServers();
    const {loading, connectError, setConnectError, connect, disconnect} = useMCPAuthFlow({
        refresh,
        onConnectError: () => setExpanded(true),
    });
    const onAuthComplete = useCallback(() => setConnectError(null), [setConnectError]);
    const {highlighted} = useMCPAuthHighlight({refresh, setExpanded, onAuthComplete});

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
                                            onClick={() => disconnect(server.server_name)}
                                            disabled={loading === server.server_name}
                                            className="flex items-center gap-1 rounded px-2 py-1 text-[10px]
                                                text-orchid-muted transition-colors hover:bg-orchid-card
                                                hover:text-red-400 disabled:opacity-50"
                                        >
                                            <Unlink className="h-3 w-3"/>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => connect(server.server_name)}
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
