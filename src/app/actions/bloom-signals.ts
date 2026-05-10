"use server";

/**
 * Server actions for the ``/bloom/signals`` surface (Phase F3).
 *
 * Signal listing is admin-only upstream (§16.1); a non-admin caller
 * gets 404 from the API and the frontend renders an empty list with
 * a "no signals visible" message.  Per-id reads honour the §26
 * visibility filter (signal is visible iff at least one of its
 * triggered runs is visible to the caller).
 */

import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

export interface BloomSignal {
    signal_id: string;
    type: string;
    source: string;
    payload: Record<string, unknown>;
    tenant_key: string;
    user_id: string | null;
    correlation_id: string | null;
    dedupe_key: string | null;
    identity_claim: Record<string, unknown> | null;
    chat_binding: Record<string, unknown> | null;
    occurred_at: string;
    persisted_at: string;
    relay_status: string;
}

export interface BloomSignalFilter {
    type?: string;
    source?: string;
    /** ISO8601 — same convention as ``listRuns``. */
    since?: string;
    limit?: number;
}

export async function listSignals(
    filter: BloomSignalFilter = {},
): Promise<BloomSignal[]> {
    try {
        const headers = await getHeaders();
        const params = new URLSearchParams();
        if (filter.type !== undefined) params.set("type", filter.type);
        if (filter.source !== undefined) params.set("source", filter.source);
        if (filter.since !== undefined) params.set("since", filter.since);
        if (filter.limit !== undefined) params.set("limit", String(filter.limit));
        const qs = params.toString();
        const res = await fetch(
            qs ? `${AGENTS_API_URL}/signals?${qs}` : `${AGENTS_API_URL}/signals`,
            {method: "GET", headers, cache: "no-store"},
        );
        if (res.status === 401) await handleUnauthorized();
        if (res.status === 404) return [];
        if (!res.ok) return [];
        const body = (await res.json()) as {items?: BloomSignal[]};
        return body.items ?? [];
    } catch (err) {
        console.error("[listSignals]", err);
        return [];
    }
}

export async function getSignal(
    signalId: string,
): Promise<BloomSignal | null> {
    try {
        const headers = await getHeaders();
        const res = await fetch(
            `${AGENTS_API_URL}/signals/${encodeURIComponent(signalId)}`,
            {method: "GET", headers, cache: "no-store"},
        );
        if (res.status === 401) await handleUnauthorized();
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return (await res.json()) as BloomSignal;
    } catch (err) {
        console.error("[getSignal]", err);
        return null;
    }
}

export async function replaySignal(
    signalId: string,
): Promise<{queueMsgId: string} | {error: string}> {
    try {
        const headers = await getHeaders();
        const res = await fetch(
            `${AGENTS_API_URL}/signals/${encodeURIComponent(signalId)}/replay`,
            {method: "POST", headers},
        );
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) {
            const text = await res.text();
            return {error: `replay failed (${res.status}): ${text}`};
        }
        const body = (await res.json()) as {queue_msg_id: string};
        return {queueMsgId: body.queue_msg_id};
    } catch (err) {
        return {error: String(err)};
    }
}
