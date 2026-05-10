"use client";

/**
 * React hooks for the ``/bloom`` panel (Phase F1 + F3 + F4).
 *
 * All hooks share the same shape: a server-action call wrapped in a
 * polling loop with a sensible default cadence.  Polling stops when
 * the run / signal / schedule reaches a terminal state OR the
 * component unmounts (the abort token guards against late ``setState``
 * calls after unmount).
 *
 * The §F4 decision pins polling cadences:
 *
 * - Run list: every 10s when visible AND no terminal-status filter.
 *   Otherwise no poll.
 * - Single run: every 3s while ``status`` is non-terminal; stop on
 *   terminal.
 * - Signal list / schedule list: 30s polling — they change slowly.
 *
 * Live SSE for the per-run stream (F2) lands in a follow-up phase;
 * F1's polling is enough for terminal-state inspection.
 */

import {useCallback, useEffect, useRef, useState} from "react";

import {
    type BloomRun,
    type BloomRunDetail,
    type BloomRunFilter,
    getRun,
    listRuns,
} from "@/app/actions/bloom-runs";
import {
    type BloomSchedule,
    listSchedules,
} from "@/app/actions/bloom-schedules";
import {
    type BloomSignal,
    type BloomSignalFilter,
    listSignals,
} from "@/app/actions/bloom-signals";
import {type BloomTrigger, listTriggers} from "@/app/actions/bloom-triggers";

const TERMINAL_STATUSES = new Set<BloomRun["status"]>([
    "succeeded",
    "failed",
    "cancelled",
]);

const DEFAULT_LIST_INTERVAL_MS = 10_000;
const DEFAULT_DETAIL_INTERVAL_MS = 3_000;
const DEFAULT_SLOW_INTERVAL_MS = 30_000;

// ── useBloomRuns ────────────────────────────────────────────


export interface UseBloomRunsResult {
    runs: BloomRun[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useBloomRuns(filter: BloomRunFilter = {}): UseBloomRunsResult {
    const [runs, setRuns] = useState<BloomRun[]>([]);
    const [loading, setLoading] = useState(true);

    const filterKey = JSON.stringify(filter);

    const refresh = useCallback(async () => {
        const items = await listRuns(filter);
        setRuns(items);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey]);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const items = await listRuns(filter);
            if (cancelled) return;
            setRuns(items);
            setLoading(false);
        };
        void tick();
        // Stop polling if a terminal-status filter is active — the
        // result set is stable.
        const isTerminal =
            filter.status !== undefined && TERMINAL_STATUSES.has(filter.status);
        if (isTerminal) {
            return () => {
                cancelled = true;
            };
        }
        const handle = setInterval(tick, DEFAULT_LIST_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey]);

    return {runs, loading, refresh};
}

// ── useBloomRun ─────────────────────────────────────────────


export interface UseBloomRunResult {
    run: BloomRunDetail | null;
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useBloomRun(runId: string | null): UseBloomRunResult {
    const [run, setRun] = useState<BloomRunDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const cancelledRef = useRef(false);

    const refresh = useCallback(async () => {
        if (runId === null) return;
        const detail = await getRun(runId);
        if (cancelledRef.current) return;
        setRun(detail);
        setLoading(false);
    }, [runId]);

    useEffect(() => {
        cancelledRef.current = false;
        if (runId === null) {
            // Defer setState to a microtask so the effect body
            // doesn't trigger a cascading render (React 19 lint
            // rule react-hooks/set-state-in-effect).
            queueMicrotask(() => {
                setRun(null);
                setLoading(false);
            });
            return;
        }
        let handle: ReturnType<typeof setTimeout> | null = null;
        let stopped = false;

        const tick = async () => {
            if (stopped) return;
            const detail = await getRun(runId);
            if (cancelledRef.current || stopped) return;
            setRun(detail);
            setLoading(false);
            if (detail !== null && TERMINAL_STATUSES.has(detail.status)) {
                return;
            }
            handle = setTimeout(tick, DEFAULT_DETAIL_INTERVAL_MS);
        };
        void tick();
        return () => {
            cancelledRef.current = true;
            stopped = true;
            if (handle !== null) clearTimeout(handle);
        };
    }, [runId]);

    return {run, loading, refresh};
}

// ── useSignals ──────────────────────────────────────────────


export interface UseBloomSignalsResult {
    signals: BloomSignal[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useSignals(
    filter: BloomSignalFilter = {},
): UseBloomSignalsResult {
    const [signals, setSignals] = useState<BloomSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const filterKey = JSON.stringify(filter);

    const refresh = useCallback(async () => {
        const items = await listSignals(filter);
        setSignals(items);
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey]);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const items = await listSignals(filter);
            if (cancelled) return;
            setSignals(items);
            setLoading(false);
        };
        void tick();
        const handle = setInterval(tick, DEFAULT_SLOW_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey]);

    return {signals, loading, refresh};
}

// ── useSchedules ────────────────────────────────────────────


export interface UseSchedulesResult {
    schedules: BloomSchedule[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useSchedules(): UseSchedulesResult {
    const [schedules, setSchedules] = useState<BloomSchedule[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const items = await listSchedules();
        setSchedules(items);
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const items = await listSchedules();
            if (cancelled) return;
            setSchedules(items);
            setLoading(false);
        };
        void tick();
        const handle = setInterval(tick, DEFAULT_SLOW_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, []);

    return {schedules, loading, refresh};
}

// ── useTriggers ─────────────────────────────────────────────


export interface UseTriggersResult {
    triggers: BloomTrigger[];
    loading: boolean;
    refresh: () => Promise<void>;
}

export function useTriggers(): UseTriggersResult {
    const [triggers, setTriggers] = useState<BloomTrigger[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const items = await listTriggers();
        setTriggers(items);
        setLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const items = await listTriggers();
            if (cancelled) return;
            setTriggers(items);
            setLoading(false);
        };
        void tick();
        // Triggers come from YAML — they don't change at runtime
        // unless the API is restarted.  60s is plenty.
        const handle = setInterval(tick, 60_000);
        return () => {
            cancelled = true;
            clearInterval(handle);
        };
    }, []);

    return {triggers, loading, refresh};
}
