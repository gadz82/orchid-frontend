/**
 * Tests for the Orchid SVG icon.
 *
 * Coverage:
 * - Renders an SVG with the configured size + className.
 * - Honours default props when none are supplied.
 */

import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";

import {OrchidIcon} from "../orchid-icon";

describe("OrchidIcon", () => {
    it("renders an SVG with default size 24 and no extra class", () => {
        const {container} = render(<OrchidIcon/>);
        const svg = container.querySelector("svg");
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute("width")).toBe("24");
        expect(svg?.getAttribute("height")).toBe("24");
        expect(svg?.getAttribute("viewBox")).toBe("0 0 24 24");
        // ``className=""`` ends up rendering an empty class attribute.
        expect(svg?.getAttribute("class") ?? "").toBe("");
    });

    it("forwards size and className to the underlying svg", () => {
        const {container} = render(
            <OrchidIcon size={48} className="text-orchid-accent"/>,
        );
        const svg = container.querySelector("svg");
        expect(svg?.getAttribute("width")).toBe("48");
        expect(svg?.getAttribute("height")).toBe("48");
        expect(svg?.getAttribute("class")).toBe("text-orchid-accent");
    });

    it("draws the expected number of path elements + a stem and centre dot", () => {
        const {container} = render(<OrchidIcon/>);
        // 5 petals + stem = 6 path elements, plus a single circle
        // for the centre — exactly one of each.
        expect(container.querySelectorAll("path")).toHaveLength(6);
        expect(container.querySelectorAll("circle")).toHaveLength(1);
    });
});
