"use client";

import {useCallback, useEffect, useState} from "react";

import {listMCPAuthServers} from "@/app/actions/mcp-auth";
import type {MCPServerAuthStatus} from "@/app/actions/mcp-auth";

interface UseMCPAuthServersResult {
    servers: MCPServerAuthStatus[];
    refresh: () => Promise<void>;
}

/**
 * Owns the MCP-auth server list state — initial load, manual refresh.
 *
 * The mount-load is guarded by a ``cancelled`` flag so a slow response
 * cannot land on an unmounted component, and is structured as an
 * ``await``-then-set-state pattern to satisfy React 19's
 * ``react-hooks/set-state-in-effect`` rule.
 */
export function useMCPAuthServers(): UseMCPAuthServersResult {
    const [servers, setServers] = useState<MCPServerAuthStatus[]>([]);

    const refresh = useCallback(async () => {
        const data = await listMCPAuthServers();
        setServers(data);
    }, []);

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

    return {servers, refresh};
}
