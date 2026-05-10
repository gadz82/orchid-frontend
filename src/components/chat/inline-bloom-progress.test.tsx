import {act, render, screen, fireEvent} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import type {BloomProgressState} from "@/hooks/use-chat-events";

import {
    InlineBloomProgress,
    describeTick,
    formatElapsed,
} from "./inline-bloom-progress";

/**
 * Component-level tests for ``<InlineBloomProgress>`` (Phase F2.5).
 * Covers the Cancel-ACL gate (LS3), tick truncation, the
 * "open in /bloom" link, and the elapsed-timer label.
 */

const NOW = new Date("2026-05-07T12:00:30.000Z").getTime();

function makeBloom(
    overrides: Partial<BloomProgressState> = {},
): BloomProgressState {
    return {
        run_id: "r-1",
        trigger_id: "deep-research",
        agent_name: "reviews",
        source_message_id: "m-1",
        identity_mode: "act_as_user",
        attached_at: "2026-05-07T12:00:00.000Z",
        status: "running",
        ticks: [],
        error: null,
        ...overrides,
    };
}

describe("InlineBloomProgress — header + link", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders trigger + agent and an aria-labelled status region", () => {
        render(<InlineBloomProgress bloom={makeBloom()} />);
        expect(
            screen.getByRole("status", {name: /deep-research/i}),
        ).toBeDefined();
        expect(screen.getByText(/deep-research/)).toBeDefined();
        expect(screen.getByText(/reviews/)).toBeDefined();
    });

    it("renders the elapsed timer for running runs", () => {
        render(<InlineBloomProgress bloom={makeBloom()} />);
        // attached_at is 30s before NOW.
        expect(screen.getByLabelText(/Elapsed 30 seconds/i)).toBeDefined();
    });

    it("hides the elapsed timer once terminal", () => {
        render(<InlineBloomProgress bloom={makeBloom({status: "finished"})} />);
        expect(screen.queryByLabelText(/Elapsed/i)).toBeNull();
    });

    it("links to /bloom/runs/{run_id} with an aria-label", () => {
        render(<InlineBloomProgress bloom={makeBloom()} />);
        const link = screen.getByRole("link", {name: /Open run r-1/i});
        expect(link.getAttribute("href")).toBe("/bloom/runs/r-1");
    });
});

describe("InlineBloomProgress — Cancel ACL (LS3)", () => {
    it("shows Cancel for act_as_user runs", () => {
        const onCancel = vi.fn();
        render(
            <InlineBloomProgress
                bloom={makeBloom({identity_mode: "act_as_user"})}
                onCancel={onCancel}
            />,
        );
        expect(
            screen.getByRole("button", {name: /Cancel run r-1/i}),
        ).toBeDefined();
    });

    it("hides Cancel for addressed_to_user runs", () => {
        render(
            <InlineBloomProgress
                bloom={makeBloom({identity_mode: "addressed_to_user"})}
                onCancel={vi.fn()}
            />,
        );
        expect(
            screen.queryByRole("button", {name: /Cancel run r-1/i}),
        ).toBeNull();
    });

    it("hides Cancel without an onCancel handler even for act_as_user", () => {
        render(
            <InlineBloomProgress
                bloom={makeBloom({identity_mode: "act_as_user"})}
            />,
        );
        expect(screen.queryByRole("button", {name: /Cancel/i})).toBeNull();
    });

    it("hides Cancel once the run is terminal regardless of identity", () => {
        render(
            <InlineBloomProgress
                bloom={makeBloom({
                    identity_mode: "act_as_user",
                    status: "finished",
                })}
                onCancel={vi.fn()}
            />,
        );
        expect(screen.queryByRole("button", {name: /Cancel/i})).toBeNull();
    });

    it("invokes onCancel with the run id when clicked", async () => {
        const onCancel = vi.fn().mockResolvedValue(undefined);
        render(
            <InlineBloomProgress
                bloom={makeBloom({identity_mode: "act_as_user"})}
                onCancel={onCancel}
            />,
        );
        // Wrap the click + awaited state flush in act() so React 19
        // doesn't warn about the ``cancelPending`` setState that
        // resolves on the microtask after the click.
        await act(async () => {
            fireEvent.click(
                screen.getByRole("button", {name: /Cancel run r-1/i}),
            );
        });
        expect(onCancel).toHaveBeenCalledWith("r-1");
    });
});

describe("InlineBloomProgress — ticks", () => {
    const ticks = Array.from({length: 8}, (_, i) => ({
        occurred_at: `2026-05-07T12:00:${i.toString().padStart(2, "0")}.000Z`,
        kind: "tool.called",
        agent: "reviews",
        tool: `t${i}`,
        status: "ok" as const,
    }));

    it("shows the most recent 5 ticks by default", () => {
        render(<InlineBloomProgress bloom={makeBloom({ticks})} />);
        // Only t3..t7 visible.
        expect(screen.queryByText(/t0/)).toBeNull();
        expect(screen.queryByText(/t2/)).toBeNull();
        expect(screen.getByText(/t7/)).toBeDefined();
        expect(screen.getByText(/t3/)).toBeDefined();
    });

    it("expands to all ticks when the toggle is clicked", () => {
        render(<InlineBloomProgress bloom={makeBloom({ticks})} />);
        fireEvent.click(
            screen.getByRole("button", {name: /show all 8 ticks/i}),
        );
        expect(screen.getByText(/t0/)).toBeDefined();
        // The toggle now reads "show less".
        expect(
            screen.getByRole("button", {name: /show less/i}),
        ).toBeDefined();
    });
});

describe("InlineBloomProgress — failure state", () => {
    it("renders the error message and a failure aria-status", () => {
        render(
            <InlineBloomProgress
                bloom={makeBloom({status: "failed", error: "tool timeout"})}
            />,
        );
        expect(screen.getByText(/tool timeout/)).toBeDefined();
    });
});

describe("formatElapsed", () => {
    it("formats sub-minute deltas as Ns", () => {
        expect(formatElapsed(0)).toBe("0s");
        expect(formatElapsed(45)).toBe("45s");
    });
    it("formats minute-level deltas as Mm SSs", () => {
        expect(formatElapsed(75)).toBe("1m 15s");
        expect(formatElapsed(305)).toBe("5m 05s");
    });
    it("formats hour-level deltas as Hh MMm", () => {
        expect(formatElapsed(3661)).toBe("1h 01m");
    });
});

describe("describeTick", () => {
    it("joins the redacted fields with a separator", () => {
        expect(
            describeTick({
                agent: "reviews",
                tool: "search",
                status: "ok",
                message: "found 12 docs",
            }),
        ).toBe("reviews · search · ok · found 12 docs");
    });
    it("returns an empty string when no fields are set", () => {
        expect(describeTick({})).toBe("");
    });
});
