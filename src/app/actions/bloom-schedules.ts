"use server";

/**
 * Server actions for the ``/bloom/schedules`` surface (Phase F4).
 *
 * Schedules are admin-only upstream — non-admin callers see 404 from
 * the API and the frontend renders an empty list with a
 * "no schedules visible" message.
 */

import {getHeaders, handleUnauthorized} from "./_api-client";
import {AGENTS_API_URL} from "./_api-config";

export interface BloomSchedule {
    schedule_id: string;
    trigger_id: string;
    cron: string | null;
    interval_seconds: number | null;
    identity_claim: Record<string, unknown>;
    last_fire_at: string | null;
    next_fire_at: string | null;
    enabled: boolean;
}

export async function listSchedules(): Promise<BloomSchedule[]> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(`${AGENTS_API_URL}/schedules`, {
            method: "GET",
            headers,
            cache: "no-store",
        });
    } catch (err) {
        console.error("[listSchedules]", err);
        return [];
    }
    if (res.status === 401) await handleUnauthorized();
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const body = (await res.json()) as {items?: BloomSchedule[]};
    return body.items ?? [];
}

export async function getSchedule(
    scheduleId: string,
): Promise<BloomSchedule | null> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(
            `${AGENTS_API_URL}/schedules/${encodeURIComponent(scheduleId)}`,
            {method: "GET", headers, cache: "no-store"},
        );
    } catch (err) {
        console.error("[getSchedule]", err);
        return null;
    }
    if (res.status === 401) await handleUnauthorized();
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as BloomSchedule;
}

export async function setScheduleEnabled(
    scheduleId: string,
    enabled: boolean,
): Promise<BloomSchedule | {error: string}> {
    let res: Response;
    try {
        const headers = await getHeaders();
        res = await fetch(
            `${AGENTS_API_URL}/schedules/${encodeURIComponent(scheduleId)}`,
            {
                method: "PATCH",
                headers,
                body: JSON.stringify({enabled}),
            },
        );
    } catch (err) {
        return {error: String(err)};
    }
    if (res.status === 401) await handleUnauthorized();
    if (!res.ok) {
        const text = await res.text();
        return {error: `patch failed (${res.status}): ${text}`};
    }
    return (await res.json()) as BloomSchedule;
}
