import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {RunStreamPane, describeEvent} from "./run-stream-pane";

/**
 * Component-level tests for ``<RunStreamPane>``.  The pane is
 * rendered with ``disabled`` so the live ``EventSource`` socket is
 * never opened — we only verify the shell layout, accessible
 * labelling, and the empty-state copy.  The reducer-driven event
 * rendering is covered by ``describeEvent`` unit tests below.
 */

describe("RunStreamPane (disabled)", () => {
    it("renders the section landmark with an aria-label", () => {
        render(<RunStreamPane runId="r-1" disabled />);
        expect(
            screen.getByRole("region", {name: /Bloom run event stream/i}),
        ).toBeDefined();
    });

    it("renders an aria-live log region", () => {
        render(<RunStreamPane runId="r-1" disabled />);
        const log = screen.getByRole("log");
        expect(log.getAttribute("aria-live")).toBe("polite");
        expect(log.getAttribute("aria-relevant")).toBe("additions");
    });

    it("shows the ``idle`` empty state when the socket is disabled", () => {
        render(<RunStreamPane runId="r-1" disabled />);
        expect(screen.getByText(/Stream not started/i)).toBeDefined();
    });

    it("renders the ``Idle`` status badge", () => {
        render(<RunStreamPane runId="r-1" disabled />);
        expect(screen.getByLabelText(/Stream status: Idle/i)).toBeDefined();
    });
});

describe("describeEvent", () => {
    it("summarises a queued event with its trigger", () => {
        expect(
            describeEvent({
                type: "bloom.run.queued",
                run_id: "r-1",
                occurred_at: "t",
                payload: {trigger_id: "morning"},
            }),
        ).toBe("trigger=morning");
    });

    it("summarises a started event with the attempt number", () => {
        expect(
            describeEvent({
                type: "bloom.run.started",
                run_id: "r-1",
                occurred_at: "t",
                payload: {attempt_number: 2},
            }),
        ).toBe("attempt #2");
    });

    it("summarises a finished event with status only on success", () => {
        expect(
            describeEvent({
                type: "bloom.run.finished",
                run_id: "r-1",
                occurred_at: "t",
                payload: {status: "succeeded"},
            }),
        ).toBe("succeeded");
    });

    it("summarises a finished event with error on failure", () => {
        expect(
            describeEvent({
                type: "bloom.run.finished",
                run_id: "r-1",
                occurred_at: "t",
                payload: {status: "failed", error: "boom"},
            }),
        ).toBe("failed — boom");
    });

    it("truncates long error messages", () => {
        const long = "x".repeat(200);
        const summary = describeEvent({
            type: "bloom.run.finished",
            run_id: "r-1",
            occurred_at: "t",
            payload: {status: "failed", error: long},
        });
        // 80-char cap, ending in an ellipsis.
        expect(summary?.length).toBeLessThanOrEqual("failed — ".length + 80);
        expect(summary?.endsWith("…")).toBe(true);
    });

    it("summarises a signal-ingested event", () => {
        expect(
            describeEvent({
                type: "bloom.signal.ingested",
                run_id: "r-1",
                occurred_at: "t",
                payload: {type: "support.ticket.created", source: "support"},
            }),
        ).toBe("support.ticket.created from support");
    });

    it("returns null for unknown event types", () => {
        expect(
            describeEvent({
                type: "bloom.unknown",
                run_id: "r-1",
                occurred_at: "t",
                payload: {},
            }),
        ).toBeNull();
    });
});
