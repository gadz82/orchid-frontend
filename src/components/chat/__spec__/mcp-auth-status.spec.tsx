/**
 * Tests for the MCP OAuth status panel.
 *
 * Coverage:
 * - Self-hides when ``listMCPAuthServers`` returns no entries.
 * - Renders ``X connected`` when every server is authorised, ``Y pending``
 *   otherwise.
 * - Clicking the chip toggles the expanded panel.
 * - Connect button opens a popup with the URL returned by the API.
 * - Connect failures surface inline.
 * - Disconnect calls ``revokeMCPToken`` and refreshes.
 * - The ``mcp-auth-needed`` window event auto-expands and pulses the
 *   matching rows.
 * - Receiving an ``mcp-auth-complete`` postMessage refreshes the list.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
    listMCPAuthServersMock,
    getMCPAuthorizeUrlMock,
    revokeMCPTokenMock,
} = vi.hoisted(() => ({
    listMCPAuthServersMock: vi.fn(),
    getMCPAuthorizeUrlMock: vi.fn(),
    revokeMCPTokenMock: vi.fn(),
}));

vi.mock("@/app/actions/mcp-auth", () => ({
    listMCPAuthServers: listMCPAuthServersMock,
    getMCPAuthorizeUrl: getMCPAuthorizeUrlMock,
    revokeMCPToken: revokeMCPTokenMock,
}));

import {MCPAuthStatus} from "../mcp-auth-status";

const mkServer = (
    name: string,
    authorized: boolean,
    agents: string[] = ["alpha"],
) => ({
    server_name: name,
    client_id: "cid",
    scopes: "openid",
    authorized,
    token_expired: false,
    agent_names: agents,
});

beforeEach(() => {
    listMCPAuthServersMock.mockReset();
    getMCPAuthorizeUrlMock.mockReset();
    revokeMCPTokenMock.mockReset();
});

describe("MCPAuthStatus — visibility", () => {
    it("renders nothing when no servers are configured", async () => {
        listMCPAuthServersMock.mockResolvedValue([]);
        const {container} = render(<MCPAuthStatus/>);
        // Wait for the load effect's setState to complete.
        await waitFor(() =>
            expect(listMCPAuthServersMock).toHaveBeenCalled(),
        );
        // Re-flush microtasks one more time to settle the empty state.
        await act(async () => {
            await Promise.resolve();
        });
        expect(container.firstChild).toBeNull();
    });

    it("shows '<n> connected' when every server is authorised", async () => {
        listMCPAuthServersMock.mockResolvedValue([
            mkServer("svc-a", true),
            mkServer("svc-b", true),
        ]);
        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("2 connected")).toBeInTheDocument(),
        );
    });

    it("shows '<n> pending' when at least one server is unauthorised", async () => {
        listMCPAuthServersMock.mockResolvedValue([
            mkServer("svc-a", true),
            mkServer("svc-b", false),
        ]);
        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );
    });
});

describe("MCPAuthStatus — expanding the panel", () => {
    it("toggles the panel when the chip is clicked", async () => {
        listMCPAuthServersMock.mockResolvedValue([
            mkServer("svc-a", false, ["alpha", "beta"]),
        ]);
        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );

        const user = userEvent.setup();

        // Closed by default.
        expect(screen.queryByText("External Services")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /1 pending/}));
        expect(screen.getByText("External Services")).toBeInTheDocument();
        expect(screen.getByText("svc-a")).toBeInTheDocument();
        expect(screen.getByText("alpha, beta")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: /1 pending/}));
        expect(screen.queryByText("External Services")).not.toBeInTheDocument();
    });
});

describe("MCPAuthStatus — connect / disconnect", () => {
    it("opens a popup with the authorization URL on Connect", async () => {
        listMCPAuthServersMock.mockResolvedValue([mkServer("svc-a", false)]);
        getMCPAuthorizeUrlMock.mockResolvedValue({
            kind: "ok",
            url: "https://idp.example/authorize?x=y",
        });
        const open = vi.spyOn(window, "open").mockReturnValue(null);

        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: /1 pending/}));
        await user.click(screen.getByRole("button", {name: /Connect/i}));

        await waitFor(() =>
            expect(getMCPAuthorizeUrlMock).toHaveBeenCalledWith("svc-a"),
        );
        expect(open).toHaveBeenCalledWith(
            "https://idp.example/authorize?x=y",
            "mcp-auth-svc-a",
            expect.stringContaining("popup=yes"),
        );
    });

    it("surfaces inline errors when the authorize action fails", async () => {
        listMCPAuthServersMock.mockResolvedValue([mkServer("svc-a", false)]);
        getMCPAuthorizeUrlMock.mockResolvedValue({
            kind: "error",
            message: "Cannot resolve authorization endpoint for 'svc-a'",
        });

        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: /1 pending/}));
        await user.click(screen.getByRole("button", {name: /Connect/i}));

        await waitFor(() =>
            expect(
                screen.getByText("Could not start sign-in for svc-a"),
            ).toBeInTheDocument(),
        );
        expect(
            screen.getByText("Cannot resolve authorization endpoint for 'svc-a'"),
        ).toBeInTheDocument();

        // Dismissing the inline error clears it.
        await user.click(screen.getByRole("button", {name: /Dismiss/i}));
        expect(
            screen.queryByText("Could not start sign-in for svc-a"),
        ).not.toBeInTheDocument();
    });

    it("calls revokeMCPToken + refresh on Disconnect", async () => {
        listMCPAuthServersMock
            .mockResolvedValueOnce([mkServer("svc-a", true)])
            .mockResolvedValueOnce([mkServer("svc-a", false)]);
        revokeMCPTokenMock.mockResolvedValue(true);

        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 connected")).toBeInTheDocument(),
        );

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", {name: /1 connected/}));

        // Disconnect button has no accessible name, so we find by class.
        const disconnect = document.querySelector(
            "button.hover\\:text-red-400",
        ) as HTMLButtonElement;
        expect(disconnect).not.toBeNull();
        await user.click(disconnect);

        await waitFor(() =>
            expect(revokeMCPTokenMock).toHaveBeenCalledWith("svc-a"),
        );
        // listMCPAuthServers fires a refresh after revoke.
        await waitFor(() =>
            expect(listMCPAuthServersMock).toHaveBeenCalledTimes(2),
        );
    });
});

describe("MCPAuthStatus — window events", () => {
    it("auto-expands and refreshes on mcp-auth-needed", async () => {
        listMCPAuthServersMock.mockResolvedValue([
            mkServer("svc-a", false),
            mkServer("svc-b", false),
        ]);

        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("2 pending")).toBeInTheDocument(),
        );
        listMCPAuthServersMock.mockClear();

        // Closed by default.
        expect(screen.queryByText("External Services")).not.toBeInTheDocument();

        await act(async () => {
            window.dispatchEvent(
                new CustomEvent("mcp-auth-needed", {
                    detail: {servers: ["svc-a"]},
                }),
            );
        });

        // Panel auto-opens and the list is refreshed.
        await waitFor(() =>
            expect(screen.getByText("External Services")).toBeInTheDocument(),
        );
        expect(listMCPAuthServersMock).toHaveBeenCalled();
    });

    it("ignores mcp-auth-needed without server names", async () => {
        listMCPAuthServersMock.mockResolvedValue([mkServer("svc-a", false)]);
        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );

        await act(async () => {
            window.dispatchEvent(
                new CustomEvent("mcp-auth-needed", {detail: {servers: []}}),
            );
        });
        // Still closed.
        expect(
            screen.queryByText("External Services"),
        ).not.toBeInTheDocument();
    });

    it("refreshes when a popup posts mcp-auth-complete", async () => {
        listMCPAuthServersMock
            .mockResolvedValueOnce([mkServer("svc-a", false)])
            .mockResolvedValueOnce([mkServer("svc-a", true)]);

        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );

        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: {type: "mcp-auth-complete"},
                }),
            );
        });

        await waitFor(() =>
            expect(screen.getByText("1 connected")).toBeInTheDocument(),
        );
    });

    it("ignores postMessage without the expected type", async () => {
        listMCPAuthServersMock.mockResolvedValue([mkServer("svc-a", false)]);
        render(<MCPAuthStatus/>);
        await waitFor(() =>
            expect(screen.getByText("1 pending")).toBeInTheDocument(),
        );
        listMCPAuthServersMock.mockClear();

        await act(async () => {
            window.dispatchEvent(
                new MessageEvent("message", {
                    data: {type: "something-else"},
                }),
            );
        });
        // No additional refresh fired.
        expect(listMCPAuthServersMock).not.toHaveBeenCalled();
    });
});
