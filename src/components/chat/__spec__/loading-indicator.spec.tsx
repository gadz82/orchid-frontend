/**
 * Tests for the typing indicator.
 *
 * Coverage:
 * - Renders three bouncing dots, each with a different animation delay.
 * - Renders the "Thinking..." caption.
 */

import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";

import {LoadingIndicator} from "../loading-indicator";

describe("LoadingIndicator", () => {
    it("renders the 'Thinking...' caption", () => {
        render(<LoadingIndicator/>);
        expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });

    it("renders exactly three dots with staggered animation delays", () => {
        const {container} = render(<LoadingIndicator/>);
        const dots = container.querySelectorAll("span.animate-bounce");
        expect(dots).toHaveLength(3);
        const delays = Array.from(dots).map((d) =>
            (d as HTMLElement).style.animationDelay,
        );
        expect(delays).toEqual(["0ms", "150ms", "300ms"]);
    });
});
