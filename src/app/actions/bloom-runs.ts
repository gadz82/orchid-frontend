"use server";

/**
 * Server actions for the ``/bloom`` runs surface (Phase F1 + F2 actions).
 *
 * Each function proxies the NextAuth bearer to ``orchid-api`` over
 * HTTP — no direct database access, no client-side bearer.  The
 * §26 visibility filter lives upstream; the frontend trusts whatever
 * the API returns.
 */

import {auth} from "@/lib/auth/auth";
import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

// ── Shared types ─────────────────────────────────────────────

/** Status values mirroring ``orchid_ai.core.events.job.JobStatus``. */
export type BloomRunStatus =
    | "pending"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "retry_scheduled";

export interface BloomRun {
    run_id: string;
    trigger_id: string;
    signal_id: string;
    agent_name: string;
    attempt_number: number;
    status: BloomRunStatus;
    visibility: string;
    visibility_user_id: string | null;
    queued_at: string;
    started_at: string | null;
    finished_at: string | null;
    error: string | null;
}

export interface BloomRunDetail extends BloomRun {
    result: Record<string, unknown> | null;
    next_retry_at: string | null;
}

export interface BloomRunFilter {
    status?: BloomRunStatus;
    triggerId?: string;
    /** ISO8601.  The CLI's "1h" / "24h" shortcuts are NOT accepted
     * here — the panel computes absolute timestamps client-side. */
    since?: string;
    limit?: number;
}

// ── Actions ──────────────────────────────────────────────────

export async function listRuns(
    filter: BloomRunFilter = {},
): Promise<BloomRun[]> {
    let res: Response;
    try {
        const session = await auth();
        if (!session?.accessToken) return [];
        const headers = await getHeaders();
        const params = new URLSearchParams();
        if (filter.status !== undefined) params.set("status", filter.status);
        if (filter.triggerId !== undefined) params.set("trigger_id", filter.triggerId);
        if (filter.since !== undefined) params.set("since", filter.since);
        if (filter.limit !== undefined) params.set("limit", String(filter.limit));
        const qs = params.toString();
        res = await fetch(
            qs ? `${AGENTS_API_URL}/runs?${qs}` : `${AGENTS_API_URL}/runs`,
            {method: "GET", headers, cache: "no-store"},
        );
    } catch (err) {
        console.error("[listRuns]", err);
        return [];
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) return [];
    const body = (await res.json()) as {items?: BloomRun[]};
    return body.items ?? [];
}

export async function getRun(runId: string): Promise<BloomRunDetail | null> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(
            `${AGENTS_API_URL}/runs/${encodeURIComponent(runId)}`,
            {method: "GET", headers, cache: "no-store"},
        );
    } catch (err) {
        console.error("[getRun]", err);
        return null;
    }
    if (res.status === 401) await handleUnauthorized();
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as BloomRunDetail;
}

export async function cancelRun(
    runId: string,
): Promise<{ok: true} | {error: string}> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(
            `${AGENTS_API_URL}/runs/${encodeURIComponent(runId)}/cancel`,
            {method: "POST", headers},
        );
    } catch (err) {
        return {error: String(err)};
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) {
        const text = await res.text();
        return {error: `cancel failed (${res.status}): ${text}`};
    }
    return {ok: true};
}

export async function retryRun(
    runId: string,
): Promise<{queueMsgId: string; previousRunId: string} | {error: string}> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(
            `${AGENTS_API_URL}/runs/${encodeURIComponent(runId)}/retry`,
            {method: "POST", headers},
        );
    } catch (err) {
        return {error: String(err)};
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) {
        const text = await res.text();
        return {error: `retry failed (${res.status}): ${text}`};
    }
    const body = (await res.json()) as {
        queue_msg_id: string;
        previous_run_id: string;
    };
    return {queueMsgId: body.queue_msg_id, previousRunId: body.previous_run_id};
}

/** List runs filtered by trigger — wraps ``listRuns`` for clarity in
 * the Trigger Detail page. */
export async function listRunsForTrigger(
    triggerId: string,
    limit = 50,
): Promise<BloomRun[]> {
    return listRuns({triggerId, limit});
}
