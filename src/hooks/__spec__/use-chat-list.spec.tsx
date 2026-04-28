/**
 * Tests for the chat-list hook + provider.
 *
 * Coverage:
 * - useChatList without a provider throws — surface the misuse clearly.
 * - Provider hydrates from listChats() once on mount.
 * - createChat refreshes the list and selects the new chat.
 * - deleteChat clears the active selection when removing the active
 *   chat; otherwise leaves it alone.
 * - Deleting the only chat triggers handleCreateChat fallback.
 * - shareChat refreshes only when the action returns true.
 */

import type {ReactNode} from "react";
import {act, renderHook, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const {listChatsMock, createChatMock, deleteChatMock, shareChatMock} =
    vi.hoisted(() => ({
        listChatsMock: vi.fn(),
        createChatMock: vi.fn(),
        deleteChatMock: vi.fn(),
        shareChatMock: vi.fn(),
    }));

vi.mock("@/app/actions/chats", () => ({
    listChats: listChatsMock,
    createChat: createChatMock,
    deleteChat: deleteChatMock,
    shareChat: shareChatMock,
}));

import {ChatListProvider, useChatList} from "../use-chat-list";

const mkChat = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    title: `chat-${id}`,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    is_shared: false,
    ...overrides,
});

const wrapper = ({children}: {children: ReactNode}) => (
    <ChatListProvider>{children}</ChatListProvider>
);

beforeEach(() => {
    listChatsMock.mockReset().mockResolvedValue([]);
    createChatMock.mockReset();
    deleteChatMock.mockReset().mockResolvedValue(true);
    shareChatMock.mockReset().mockResolvedValue(true);
});

describe("useChatList without provider", () => {
    it("throws a clear error", () => {
        // ``renderHook`` without a wrapper exercises the missing-context
        // branch.  React logs through console.error; suppress for a
        // cleaner test transcript.
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => renderHook(() => useChatList())).toThrow(
            /useChatList must be used within a ChatListProvider/,
        );
        spy.mockRestore();
    });
});

describe("ChatListProvider — initial load", () => {
    it("hydrates from listChats and clears loading once resolved", async () => {
        const initial = [mkChat("a"), mkChat("b")];
        listChatsMock.mockResolvedValue(initial);

        const {result} = renderHook(() => useChatList(), {wrapper});

        // Loading flips to false after the effect settles.
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.chats).toEqual(initial);
        expect(result.current.activeChatId).toBeNull();
    });
});

describe("ChatListProvider — createChat", () => {
    it("refreshes and activates the new chat on success", async () => {
        const created = mkChat("new");
        createChatMock.mockResolvedValue(created);
        listChatsMock
            .mockResolvedValueOnce([])           // initial mount
            .mockResolvedValueOnce([created]);   // post-create refresh

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.loading).toBe(false));

        let returned: unknown;
        await act(async () => {
            returned = await result.current.handleCreateChat();
        });

        expect(returned).toEqual(created);
        await waitFor(() => expect(result.current.activeChatId).toBe("new"));
        expect(result.current.chats).toEqual([created]);
    });

    it("does nothing if createChat returns null", async () => {
        createChatMock.mockResolvedValue(null);
        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
            await result.current.handleCreateChat();
        });

        // listChats only called once (initial load) — no refresh.
        expect(listChatsMock).toHaveBeenCalledTimes(1);
        expect(result.current.activeChatId).toBeNull();
    });
});

describe("ChatListProvider — deleteChat", () => {
    it("keeps the active selection when an inactive chat is deleted", async () => {
        const a = mkChat("a");
        const b = mkChat("b");
        listChatsMock
            .mockResolvedValueOnce([a, b])
            .mockResolvedValueOnce([a]);

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.chats).toHaveLength(2));

        act(() => {
            result.current.setActiveChatId("a");
        });

        await act(async () => {
            await result.current.handleDeleteChat("b");
        });

        // Active stays on "a" — only "b" was removed.
        expect(result.current.activeChatId).toBe("a");
        expect(deleteChatMock).toHaveBeenCalledWith("b");
    });

    it("switches to the next survivor when the active chat is deleted", async () => {
        const a = mkChat("a");
        const b = mkChat("b");
        listChatsMock
            .mockResolvedValueOnce([a, b])
            .mockResolvedValueOnce([b]);

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.chats).toHaveLength(2));

        act(() => {
            result.current.setActiveChatId("a");
        });

        await act(async () => {
            await result.current.handleDeleteChat("a");
        });

        await waitFor(() => expect(result.current.activeChatId).toBe("b"));
    });

    it("creates a fresh chat when the only chat is deleted", async () => {
        const only = mkChat("only");
        const fresh = mkChat("fresh");
        listChatsMock
            .mockResolvedValueOnce([only])  // initial mount
            .mockResolvedValueOnce([])      // post-delete refresh
            .mockResolvedValueOnce([fresh]); // post-create refresh
        createChatMock.mockResolvedValue(fresh);

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.chats).toHaveLength(1));

        act(() => {
            result.current.setActiveChatId("only");
        });

        await act(async () => {
            await result.current.handleDeleteChat("only");
        });

        await waitFor(() =>
            expect(createChatMock).toHaveBeenCalled(),
        );
        await waitFor(() => expect(result.current.activeChatId).toBe("fresh"));
    });
});

describe("ChatListProvider — shareChat", () => {
    it("refreshes the list when share succeeds", async () => {
        const a = mkChat("a");
        const shared = mkChat("a", {is_shared: true});
        listChatsMock
            .mockResolvedValueOnce([a])
            .mockResolvedValueOnce([shared]);
        shareChatMock.mockResolvedValue(true);

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.chats).toHaveLength(1));

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.handleShareChat("a");
        });

        expect(ok).toBe(true);
        await waitFor(() =>
            expect(result.current.chats[0].is_shared).toBe(true),
        );
    });

    it("does NOT refresh when share fails", async () => {
        const a = mkChat("a");
        listChatsMock.mockResolvedValueOnce([a]);
        shareChatMock.mockResolvedValue(false);

        const {result} = renderHook(() => useChatList(), {wrapper});
        await waitFor(() => expect(result.current.chats).toHaveLength(1));
        listChatsMock.mockClear();

        let ok: boolean | undefined;
        await act(async () => {
            ok = await result.current.handleShareChat("a");
        });
        expect(ok).toBe(false);
        // No additional refresh call.
        expect(listChatsMock).not.toHaveBeenCalled();
    });
});
