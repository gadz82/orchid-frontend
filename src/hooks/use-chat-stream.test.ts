import {describe, expect, it, vi} from "vitest";
import {renderHook} from "@testing-library/react";

// Mock the stream config action
vi.mock("@/app/actions/stream", () => ({
    getStreamConfig: vi.fn().mockResolvedValue({
        url: "http://test.test",
        headers: {}
    })
}));

import {useChatStream} from "./use-chat-stream";

describe("useChatStream", () => {
    it("should call onCancel when AbortError occurs", async () => {
        // Mock fetch to throw AbortError
        global.fetch = vi.fn(() => {
            const error = new Error("AbortError");
            error.name = "AbortError";
            throw error;
        });

        const {result} = renderHook(() => useChatStream());
        const onCancel = vi.fn();
        const onError = vi.fn();
        
        await result.current.streamMessage("test-chat", "test message", null, {
            onToken: vi.fn(),
            onStatus: vi.fn(),
            onActivity: vi.fn(),
            onDone: vi.fn(),
            onError: onError,
            onAgentResult: vi.fn(),
            onHandoff: vi.fn(),
            onCancel: onCancel
        });

        expect(onCancel).toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it("should not call onCancel on other errors", async () => {
        // Mock fetch to throw regular error
        global.fetch = vi.fn(() => {
            throw new Error("Regular error");
        });

        const {result} = renderHook(() => useChatStream());
        const onCancel = vi.fn();
        const onError = vi.fn();
        
        await result.current.streamMessage("test-chat", "test message", null, {
            onToken: vi.fn(),
            onStatus: vi.fn(),
            onActivity: vi.fn(),
            onDone: vi.fn(),
            onError: onError,
            onAgentResult: vi.fn(),
            onHandoff: vi.fn(),
            onCancel: onCancel
        });

        expect(onCancel).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalled();
    });
});