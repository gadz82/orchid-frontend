"use server";

import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

// ── Types ──────────────────────────────────────────────────

export interface MCPServerAuthStatus {
    server_name: string;
    client_id: string;
    scopes: string;
    authorized: boolean;
    token_expired: boolean;
    agent_names: string[];
}

/**
 * Result of requesting an authorization URL.  Callers must branch on
 * ``kind`` — previously this action returned ``string | null``, which
 * silently swallowed server errors (notably the common misconfiguration
 * where ``auth.mode: oauth`` is declared without ``authorization_endpoint``
 * / ``issuer`` — the API returns 500 and the popup never opened).
 */
export type MCPAuthorizeResult =
    | {kind: "ok"; url: string}
    | {kind: "error"; message: string; status?: number};

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

export async function getMCPAuthorizeUrl(serverName: string): Promise<MCPAuthorizeResult> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/mcp/auth/servers/${encodeURIComponent(serverName)}/authorize`, {
            method: "GET",
            headers,
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) {
            // Surface the API's ``detail`` field when present — the
            // authorize endpoint uses it to explain misconfiguration
            // (e.g. "Cannot resolve authorization endpoint for 'foo'").
            let detail = "";
            try {
                const body = await res.json();
                detail = typeof body?.detail === "string" ? body.detail : "";
            } catch {
                try {
                    detail = await res.text();
                } catch {
                    detail = "";
                }
            }
            return {
                kind: "error",
                message: detail || `Authorization request failed (${res.status})`,
                status: res.status,
            };
        }
        const data = await res.json();
        if (!data?.authorize_url) {
            return {kind: "error", message: "API did not return an authorization URL"};
        }
        return {kind: "ok", url: data.authorize_url};
    } catch (err) {
        return {
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
        };
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
