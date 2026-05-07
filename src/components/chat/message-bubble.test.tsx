import {describe, expect, it} from "vitest";

import {readBloomMetadata} from "./message-bubble";

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
