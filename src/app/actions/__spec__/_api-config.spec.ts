/**
 * Tests for the API config constant.
 *
 * Coverage:
 * - Defaults to ``http://127.0.0.1:8000`` (avoids dual-stack IPv6 in
 *   Node 20+ fetch on macOS Docker).
 * - Honours the ``AGENTS_API_URL`` env override at module-load time.
 */

import {afterAll, beforeEach, describe, expect, it, vi} from "vitest";

const ORIGINAL = process.env.AGENTS_API_URL;

beforeEach(() => {
    vi.resetModules();
});

afterAll(() => {
    if (ORIGINAL === undefined) {
        delete process.env.AGENTS_API_URL;
    } else {
        process.env.AGENTS_API_URL = ORIGINAL;
    }
});

describe("AGENTS_API_URL", () => {
    it("defaults to 127.0.0.1 when the env is unset", async () => {
        delete process.env.AGENTS_API_URL;
        const mod = await import("../_api-config");
        expect(mod.AGENTS_API_URL).toBe("http://127.0.0.1:8000");
    });

    it("respects the env override", async () => {
        process.env.AGENTS_API_URL = "https://api.example.test";
        const mod = await import("../_api-config");
        expect(mod.AGENTS_API_URL).toBe("https://api.example.test");
    });
});
