import "@testing-library/jest-dom/vitest";
import {afterEach, vi} from "vitest";
import {cleanup} from "@testing-library/react";

// jsdom doesn't implement scrollIntoView; the MessageList relies on
// it for its auto-scroll effect.  Stub once globally so any test that
// renders the list (directly or transitively) doesn't throw.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
}

afterEach(() => {
    cleanup();
});
