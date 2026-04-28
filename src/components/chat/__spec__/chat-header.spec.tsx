/**
 * Tests for the chat header.
 *
 * Coverage:
 * - The header renders the Orchid brand + sign-out button.
 * - The user's name is shown when present in the session.
 * - Clicking sign-out delegates to next-auth/react's signOut helper
 *   with the expected callback URL.
 * - The MCP auth panel mounts and renders nothing when there are no
 *   OAuth-protected MCP servers.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {sessionState, useSessionMock, signOutMock, listMCPAuthServersMock} =
    vi.hoisted(() => ({
        sessionState: {
            current: {data: null as unknown, status: "unauthenticated"},
        },
        useSessionMock: vi.fn(),
        signOutMock: vi.fn(),
        listMCPAuthServersMock: vi.fn(),
    }));

vi.mock("next-auth/react", () => ({
    useSession: () => sessionState.current,
    signOut: signOutMock,
}));

vi.mock("@/app/actions/mcp-auth", () => ({
    listMCPAuthServers: listMCPAuthServersMock,
    getMCPAuthorizeUrl: vi.fn(),
    revokeMCPToken: vi.fn(),
}));

import {ChatHeader} from "../chat-header";

beforeEach(() => {
    sessionState.current = {data: null, status: "unauthenticated"};
    useSessionMock.mockReset();
    signOutMock.mockReset();
    listMCPAuthServersMock.mockReset().mockResolvedValue([]);
});

describe("ChatHeader", () => {
    it("renders the Orchid brand", () => {
        render(<ChatHeader/>);
        expect(screen.getByText("Orchid")).toBeInTheDocument();
    });

    it("hides the user name when the session has none", () => {
        render(<ChatHeader/>);
        // The hidden span is only rendered when there's a name; absence
        // means our test session.user.name is undefined.
        expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });

    it("shows the user name when the session provides one", () => {
        sessionState.current = {
            data: {user: {name: "Alice"}},
            status: "authenticated",
        };
        render(<ChatHeader/>);
        expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    it("calls signOut with /login as the callback when clicked", async () => {
        render(<ChatHeader/>);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: /Sign out/i}));
        expect(signOutMock).toHaveBeenCalledWith({callbackUrl: "/login"});
    });

    it("does not render the MCP auth chip when no OAuth servers are configured", async () => {
        listMCPAuthServersMock.mockResolvedValue([]);
        render(<ChatHeader/>);
        await waitFor(() => {
            expect(listMCPAuthServersMock).toHaveBeenCalled();
        });
        // Chip text only appears when the panel mounts a button.
        expect(screen.queryByText(/connected/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/pending/i)).not.toBeInTheDocument();
    });
});
