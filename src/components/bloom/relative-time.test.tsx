import {render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import {RelativeTime} from "./relative-time";

describe("RelativeTime", () => {
    const NOW = new Date("2026-05-07T12:00:00.000Z").getTime();
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("renders an em-dash for null", () => {
        render(<RelativeTime iso={null} />);
        expect(screen.getByText("—")).toBeDefined();
    });

    it("renders 'just now' for sub-30s deltas", () => {
        render(
            <RelativeTime
                iso={new Date(NOW - 5_000).toISOString()}
            />,
        );
        expect(screen.getByText("just now")).toBeDefined();
    });

    it("renders minute-level deltas", () => {
        render(
            <RelativeTime
                iso={new Date(NOW - 5 * 60_000).toISOString()}
            />,
        );
        expect(screen.getByText("5 min ago")).toBeDefined();
    });

    it("renders hour-level deltas", () => {
        render(
            <RelativeTime
                iso={new Date(NOW - 3 * 3600_000).toISOString()}
            />,
        );
        expect(screen.getByText("3 hours ago")).toBeDefined();
    });

    it("attaches the absolute ISO as a tooltip (title attr)", () => {
        const iso = new Date(NOW - 60_000).toISOString();
        render(<RelativeTime iso={iso} />);
        const el = screen.getByText("1 min ago");
        expect(el.getAttribute("title")).toBe(iso);
    });

    it("renders the raw string when the input isn't parseable", () => {
        render(<RelativeTime iso="not-an-iso-string" />);
        expect(screen.getByText("not-an-iso-string")).toBeDefined();
    });
});
