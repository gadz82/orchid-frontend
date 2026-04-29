"use client";

import {useCallback, useState} from "react";

import {getMCPAuthorizeUrl, revokeMCPToken} from "@/app/actions/mcp-auth";

export interface MCPConnectError {
    server: string;
    message: string;
}

interface UseMCPAuthFlowArgs {
    refresh: () => Promise<void>;
    onConnectError: () => void;
}

interface UseMCPAuthFlowResult {
    loading: string | null;
    connectError: MCPConnectError | null;
    setConnectError: React.Dispatch<React.SetStateAction<MCPConnectError | null>>;
    connect: (serverName: string) => Promise<void>;
    disconnect: (serverName: string) => Promise<void>;
}

/**
 * OAuth connect / disconnect flow for the MCP auth panel.
 *
 * Owns the per-server ``loading`` flag and the inline ``connectError``
 * surfaced when authorize-URL fetch fails (typically a YAML
 * misconfiguration). Connect opens a popup window the size of an OAuth
 * consent screen; the popup signals completion via ``postMessage``,
 * picked up by :func:`useMCPAuthHighlight`.
 */
export function useMCPAuthFlow({
    refresh,
    onConnectError,
}: UseMCPAuthFlowArgs): UseMCPAuthFlowResult {
    const [loading, setLoading] = useState<string | null>(null);
    const [connectError, setConnectError] = useState<MCPConnectError | null>(null);

    const connect = useCallback(
        async (serverName: string) => {
            setLoading(serverName);
            setConnectError(null);
            const result = await getMCPAuthorizeUrl(serverName);
            setLoading(null);
            if (result.kind === "ok") {
                window.open(result.url, `mcp-auth-${serverName}`, "width=600,height=700,popup=yes");
            } else {
                setConnectError({server: serverName, message: result.message});
                onConnectError();
            }
        },
        [onConnectError],
    );

    const disconnect = useCallback(
        async (serverName: string) => {
            setLoading(serverName);
            await revokeMCPToken(serverName);
            await refresh();
            setLoading(null);
        },
        [refresh],
    );

    return {loading, connectError, setConnectError, connect, disconnect};
}
