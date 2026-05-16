import {describe, expect, it} from "vitest";
import {render} from "@testing-library/react";

import {readBloomMetadata, MessageBubble} from "./message-bubble";

describe("readBloomMetadata", () => {
    it("returns null for missing metadata", () => {
        expect(readBloomMetadata(null)).toBeNull();
        expect(readBloomMetadata(undefined)).toBeNull();
        expect(readBloomMetadata({})).toBeNull();
    });

    it("returns null for non-bloom origin", () => {
        expect(readBloomMetadata({origin: "user"})).toBeNull();
    });

    it("returns null when bloom_run_id is missing or empty", () => {
        expect(readBloomMetadata({origin: "bloom"})).toBeNull();
        expect(
            readBloomMetadata({origin: "bloom", bloom_run_id: ""}),
        ).toBeNull();
    });

    it("projects run_id + trigger_id + delivered_at", () => {
        const got = readBloomMetadata({
            origin: "bloom",
            bloom_run_id: "r-1",
            trigger_id: "morning-trivia",
            delivered_at: "2026-05-07T07:00:00+00:00",
        });
        expect(got).toEqual({
            runId: "r-1",
            triggerId: "morning-trivia",
            deliveredAt: "2026-05-07T07:00:00+00:00",
            failed: false,
        });
    });

    it("flags failed bloom messages", () => {
        const got = readBloomMetadata({
            origin: "bloom",
            bloom_run_id: "r-1",
            status: "failed",
        });
        expect(got?.failed).toBe(true);
    });
});

describe("MessageBubble cancelled badge", () => {
    it("renders cancelled badge when message is cancelled", () => {
        const {getByText} = render(<MessageBubble message={{
            id: "test-id",
            role: "assistant",
            content: "Test response",
            timestamp: new Date(),
            cancelled: true
        }} />);
        expect(getByText("cancelled")).toBeTruthy();
    });
    
    it("does not render cancelled badge when message is not cancelled", () => {
        const {queryByText} = render(<MessageBubble message={{
            id: "test-id",
            role: "assistant",
            content: "Test response",
            timestamp: new Date(),
            cancelled: false
        }} />);
        expect(queryByText("cancelled")).toBeNull();
    });
});
