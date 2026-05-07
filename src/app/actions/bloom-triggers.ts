"use server";

/**
 * Server actions for the ``/bloom/triggers`` surface (Phase F4).
 *
 * Triggers are read-only in v1 — the YAML is the source of truth.
 * The frontend exposes ``listTriggers`` (an alias for ``GET /jobs``)
 * plus ``listRunsForTrigger`` (delegated to ``bloom-runs.ts``).
 */

import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

export interface BloomTrigger {
    trigger_id: string;
    parallelism: string;
    visibility: string;
    respect_chat_binding: boolean;
}

export async function listTriggers(): Promise<BloomTrigger[]> {
    try {
        const headers = await getHeaders();
        const res = await fetch(`${AGENTS_API_URL}/jobs`, {
            method: "GET",
            headers,
            cache: "no-store",
        });
        if (res.status === 401) await handleUnauthorized();
        if (!res.ok) return [];
        const body = (await res.json()) as {items?: BloomTrigger[]};
        return body.items ?? [];
    } catch (err) {
        console.error("[listTriggers]", err);
        return [];
    }
}

/**
 * No dedicated ``GET /jobs/{id}`` endpoint upstream — we filter the
 * registry list client-side.  Cheap because the registry is small
 * (typically < 50 triggers) and the result is short-lived.
 */
export async function getTrigger(
    triggerId: string,
): Promise<BloomTrigger | null> {
    const all = await listTriggers();
    return all.find((t) => t.trigger_id === triggerId) ?? null;
}
