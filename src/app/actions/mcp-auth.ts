"use server";

import {auth, signOut} from "@/lib/auth/auth";
import {redirect} from "next/navigation";

const AGENTS_API_URL = process.env.AGENTS_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────

export interface MCPServerAuthStatus {
    server_name: string;
    client_id: string;
    scopes: string;
    authorized: boolean;
    token_expired: boolean;
    agent_names: string[];
}

// ── Helpers ─────────────────────────────────────────────────

async function handleUnauthorized(): Promise<never> {
    await signOut({redirect: false});
    redirect("/login");
}

async function getHeaders(): Promise<Record<string, string>> {
    const session = await auth();
    const token = session?.accessToken;
    return {
        "Content-Type": "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
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
