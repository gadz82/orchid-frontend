/**
 * Tests for the chat sidebar.
 *
 * Coverage:
 * - Collapsed mode renders only the expand-toggle button.
 * - Expanded mode shows new-chat / collapse buttons + chat list.
 * - Loading and empty states render the expected placeholder text.
 * - Click on an item activates the chat; Enter / Space selects too.
 * - The delete and share buttons require a confirm() before firing.
 * - Shared chats render a "Shared" badge instead of the share button.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {ChatSidebar} from "../chat-sidebar";

// Hoisted factory + spies so per-test overrides reach the mocked hook.
const {hookState, useChatListMock} = vi.hoisted(() => {
    const state = {
        chats: [] as unknown[],
        loading: false,
        activeChatId: null as string | null,
        setActiveChatId: vi.fn(),
        refreshChats: vi.fn(),
        handleCreateChat: vi.fn(),
        handleDeleteChat: vi.fn(),
        handleShareChat: vi.fn(),
    };
    return {
        hookState: state,
        useChatListMock: vi.fn(() => state),
    };
});

vi.mock("@/hooks/use-chat-list", () => ({
    useChatList: useChatListMock,
}));

beforeEach(() => {
    hookState.chats = [];
    hookState.loading = false;
    hookState.activeChatId = null;
    hookState.setActiveChatId.mockReset();
    hookState.refreshChats.mockReset().mockResolvedValue(undefined);
    hookState.handleCreateChat.mockReset().mockResolvedValue({id: "new"});
    hookState.handleDeleteChat.mockReset().mockResolvedValue(undefined);
    hookState.handleShareChat.mockReset().mockResolvedValue(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ChatSidebar — collapsed", () => {
    it("renders only the expand button", () => {
        const onToggle = vi.fn();
        render(<ChatSidebar collapsed onToggle={onToggle}/>);
        expect(screen.getByLabelText("Expand sidebar")).toBeInTheDocument();
        expect(screen.queryByLabelText("New chat")).not.toBeInTheDocument();
    });

    it("calls onToggle when the expand button is clicked", async () => {
        const onToggle = vi.fn();
        render(<ChatSidebar collapsed onToggle={onToggle}/>);
        await userEvent.setup().click(screen.getByLabelText("Expand sidebar"));
        expect(onToggle).toHaveBeenCalled();
    });
});

describe("ChatSidebar — expanded loading + empty states", () => {
    it("shows the loading placeholder while fetching", () => {
        hookState.loading = true;
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("shows the empty placeholder when no chats are returned", () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        expect(screen.getByText("No chats yet")).toBeInTheDocument();
    });

    it("collapse button calls onToggle", async () => {
        const onToggle = vi.fn();
        render(<ChatSidebar collapsed={false} onToggle={onToggle}/>);
        await userEvent.setup().click(screen.getByLabelText("Collapse sidebar"));
        expect(onToggle).toHaveBeenCalled();
    });

    it("new-chat button delegates to handleCreateChat", async () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        await userEvent.setup().click(screen.getByLabelText("New chat"));
        expect(hookState.handleCreateChat).toHaveBeenCalled();
    });
});

describe("ChatSidebar — populated chat list", () => {
    beforeEach(() => {
        hookState.chats = [
            {
                id: "c1",
                title: "First chat",
                created_at: "2026-04-27T00:00:00Z",
                updated_at: "2026-04-27T00:00:00Z",
                is_shared: false,
            },
            {
                id: "c2",
                title: "Second chat",
                created_at: "2026-04-27T00:00:00Z",
                updated_at: "2026-04-27T00:00:00Z",
                is_shared: true,
            },
        ];
        hookState.activeChatId = "c1";
    });

    it("renders one row per chat", () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        expect(screen.getByText("First chat")).toBeInTheDocument();
        expect(screen.getByText("Second chat")).toBeInTheDocument();
    });

    it("activates a chat on click", async () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        await userEvent.setup().click(screen.getByText("Second chat"));
        expect(hookState.setActiveChatId).toHaveBeenCalledWith("c2");
    });

    it("activates a chat on Enter or Space key", async () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        const row = screen.getByText("Second chat").closest("[role='button']")!;
        (row as HTMLDivElement).focus();
        await userEvent.setup().keyboard("{Enter}");
        expect(hookState.setActiveChatId).toHaveBeenCalledWith("c2");

        hookState.setActiveChatId.mockClear();
        await userEvent.setup().keyboard(" ");
        expect(hookState.setActiveChatId).toHaveBeenCalledWith("c2");
    });

    it("does not switch when the user cancels delete confirmation", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(false);
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        const deleteBtn = screen.getAllByLabelText("Delete chat")[0];
        await userEvent.setup().click(deleteBtn);
        expect(hookState.handleDeleteChat).not.toHaveBeenCalled();
        expect(hookState.setActiveChatId).not.toHaveBeenCalled();
    });

    it("delegates a confirmed delete to handleDeleteChat without selecting", async () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        const deleteBtn = screen.getAllByLabelText("Delete chat")[0];
        await userEvent.setup().click(deleteBtn);
        expect(hookState.handleDeleteChat).toHaveBeenCalledWith("c1");
        // ``stopPropagation`` keeps the click from also activating the row.
        expect(hookState.setActiveChatId).not.toHaveBeenCalled();
    });

    it("delegates a confirmed share to handleShareChat", async () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        // Only the first chat is shareable — the second already shows
        // a Shared badge.
        const shareBtn = screen.getByLabelText("Share chat");
        await userEvent.setup().click(shareBtn);
        expect(hookState.handleShareChat).toHaveBeenCalledWith("c1");
    });

    it("renders a Shared badge for already-shared chats", () => {
        render(<ChatSidebar collapsed={false} onToggle={vi.fn()}/>);
        expect(screen.getByText("Shared")).toBeInTheDocument();
        // Only one share button — the already-shared row hides it.
        expect(screen.getAllByLabelText("Share chat")).toHaveLength(1);
    });
});
