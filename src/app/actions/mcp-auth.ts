"use server";

import {AGENTS_API_URL, getHeaders, handleUnauthorized} from "./_api-client";

// ── Types ──────────────────────────────────────────────────

export interface MCPServerAuthStatus {
    server_name: string;
    client_id: string;
    scopes: string;
    authorized: boolean;
    token_expired: boolean;
    agent_names: string[];
}

// ── Server Actions ──────────────────────────────────────────

export async function listMCPAuthServers(): Promise<MCPServerAuthStatus[]> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/mcp/auth/servers`, {
            method: "GET",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) return [];
        return await res.json();
    } catch {
        return [];
    }
}

export async function getMCPAuthorizeUrl(serverName: string): Promise<string | null> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/mcp/auth/servers/${encodeURIComponent(serverName)}/authorize`, {
            method: "GET",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) return null;
        const data = await res.json();
        return data.authorize_url ?? null;
    } catch {
        return null;
    }
}

export async function revokeMCPToken(serverName: string): Promise<boolean> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/mcp/auth/servers/${encodeURIComponent(serverName)}/token`, {
            method: "DELETE",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        return res.ok || res.status === 204;
    } catch {
        return false;
    }
}
