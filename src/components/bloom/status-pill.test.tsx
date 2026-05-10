import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {StatusPill} from "./status-pill";

describe("StatusPill", () => {
    it("renders the human label for each known status", () => {
        const cases: Array<[string, string]> = [
            ["succeeded", "Succeeded"],
            ["running", "Running"],
            ["pending", "Pending"],
            ["failed", "Failed"],
            ["cancelled", "Cancelled"],
            ["retry_scheduled", "Retry scheduled"],
        ];
        for (const [status, label] of cases) {
            const {unmount} = render(
                <StatusPill status={status as Parameters<typeof StatusPill>[0]["status"]} />,
            );
            expect(screen.getByText(label)).toBeDefined();
            unmount();
        }
    });

    it("exposes an aria-label for screen readers", () => {
        render(<StatusPill status="running" />);
        expect(
            screen.getByLabelText("Run status: Running"),
        ).toBeDefined();
    });
});
