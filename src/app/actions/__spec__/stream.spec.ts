/**
 * Tests for the stream-config Server Action.
 *
 * Coverage:
 * - Returns the API base URL + bearer header when a session exists.
 * - Reads the ``streaming_enabled`` flag from /chats/capabilities.
 * - Defaults streaming to enabled when capabilities can't be fetched.
 * - Omits the Authorization header when no session is available.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";

const {authMock} = vi.hoisted(() => ({
    authMock: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
    auth: authMock,
}));

import {getStreamConfig} from "../stream";

beforeEach(() => {
    authMock.mockReset();
});

describe("getStreamConfig", () => {
    it("returns the bearer + base URL + capabilities flag", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        let capturedHeaders: Record<string, string> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                capturedHeaders = init?.headers as Record<string, string>;
                return new Response(
                    JSON.stringify({streaming_enabled: false}),
                    {status: 200},
                );
            },
        );

        const cfg = await getStreamConfig();
        expect(cfg.url).toBe("http://127.0.0.1:8000");
        expect(cfg.headers).toEqual({Authorization: "Bearer tok"});
        expect(cfg.streamingEnabled).toBe(false);
        expect(capturedHeaders?.Authorization).toBe("Bearer tok");
    });

    it("defaults streamingEnabled to true when capabilities is missing the flag", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({}), {status: 200}),
        );
        const cfg = await getStreamConfig();
        expect(cfg.streamingEnabled).toBe(true);
    });

    it("defaults streamingEnabled to true on a non-2xx capabilities response", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("", {status: 500}),
        );
        const cfg = await getStreamConfig();
        expect(cfg.streamingEnabled).toBe(true);
    });

    it("defaults streamingEnabled to true on a network error", async () => {
        authMock.mockResolvedValue({accessToken: "tok"});
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));
        const cfg = await getStreamConfig();
        expect(cfg.streamingEnabled).toBe(true);
    });

    it("omits the Authorization header when no session exists", async () => {
        authMock.mockResolvedValue(null);
        let capturedHeaders: Record<string, string> | undefined;
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                capturedHeaders = init?.headers as Record<string, string>;
                return new Response(JSON.stringify({}), {status: 200});
            },
        );
        const cfg = await getStreamConfig();
        expect(cfg.headers).toEqual({});
        expect(capturedHeaders).toEqual({});
    });
});
