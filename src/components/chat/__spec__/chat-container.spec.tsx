/**
 * Tests for the multi-chat container.
 *
 * Coverage:
 * - Renders the loading splash while the session is still resolving.
 * - Returns null when unauthenticated and triggers a router push to /login.
 * - Auto-creates a chat on mount when the chat list is empty.
 * - Auto-selects the first chat when one already exists.
 * - Loads message history for the active chat.
 * - Renders the drag-overlay only when the drag-drop hook reports a
 *   live drag.
 *
 * The send-message workflow is exercised in detail at the hook level
 * (use-chat-stream.spec); here we just sanity-check the wiring.
 */

import {beforeEach, describe, expect, it, vi} from "vitest";
import {render, screen, waitFor} from "@testing-library/react";

const {
    useSessionMock,
    signOutMock,
    routerPushMock,
    useRouterMock,
    chatListState,
    useChatListMock,
    loadMessagesMock,
    streamMessageMock,
    useChatStreamMock,
    dragDropState,
    useDragDropMock,
} = vi.hoisted(() => {
    const sessionState = {
        current: {data: null as unknown, status: "loading"},
    };
    const chatList = {
        chats: [] as Array<Record<string, unknown>>,
        loading: false,
        activeChatId: null as string | null,
        setActiveChatId: vi.fn(),
        refreshChats: vi.fn(),
        handleCreateChat: vi.fn(),
        handleDeleteChat: vi.fn(),
        handleShareChat: vi.fn(),
    };
    const dragDrop = {
        dragOver: false,
        droppedFiles: [] as File[],
        setDroppedFiles: vi.fn(),
        dragHandlers: {
            onDragEnter: vi.fn(),
            onDragLeave: vi.fn(),
            onDragOver: vi.fn(),
            onDrop: vi.fn(),
        },
    };
    return {
        useSessionMock: () => sessionState.current,
        signOutMock: vi.fn(),
        routerPushMock: vi.fn(),
        useRouterMock: vi.fn(() => ({push: routerPushMock} as unknown)),
        chatListState: chatList,
        useChatListMock: vi.fn(() => chatList),
        loadMessagesMock: vi.fn(),
        streamMessageMock: vi.fn(),
        useChatStreamMock: vi.fn(() => ({
            streamMessage: streamMessageMock,
            cancelStream: vi.fn(),
        })),
        dragDropState: dragDrop,
        useDragDropMock: vi.fn(() => dragDrop),
    };
});

vi.mock("next-auth/react", () => ({
    useSession: useSessionMock,
    signOut: signOutMock,
}));

vi.mock("next/navigation", () => ({
    useRouter: useRouterMock,
}));

vi.mock("@/hooks/use-chat-list", () => ({
    useChatList: useChatListMock,
}));

vi.mock("@/hooks/use-chat-stream", () => ({
    useChatStream: useChatStreamMock,
}));

vi.mock("@/hooks/use-drag-drop", () => ({
    useDragDrop: useDragDropMock,
}));

vi.mock("@/app/actions/chats", () => ({
    loadMessages: loadMessagesMock,
}));

vi.mock("@/app/actions/mcp-auth", () => ({
    listMCPAuthServers: vi.fn().mockResolvedValue([]),
    getMCPAuthorizeUrl: vi.fn(),
    revokeMCPToken: vi.fn(),
}));

const {ChatContainer} = await import("../chat-container");

const sessionRef = useSessionMock();

function setSession(value: unknown, status: string) {
    Object.assign(sessionRef, {data: value, status});
    // Direct mutation works because every test reads via useSessionMock.
}

beforeEach(() => {
    setSession(null, "loading");
    chatListState.chats = [];
    chatListState.loading = false;
    chatListState.activeChatId = null;
    chatListState.setActiveChatId.mockReset();
    chatListState.handleCreateChat.mockReset().mockResolvedValue({id: "x"});
    routerPushMock.mockReset();
    loadMessagesMock.mockReset().mockResolvedValue([]);
    streamMessageMock.mockReset().mockResolvedValue(undefined);
    dragDropState.dragOver = false;
    dragDropState.droppedFiles = [];
});

describe("ChatContainer — auth states", () => {
    it("renders the splash when status==='loading'", () => {
        setSession(null, "loading");
        render(<ChatContainer/>);
        expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("returns null and pushes to /login when unauthenticated", async () => {
        setSession(null, "unauthenticated");
        const {container} = render(<ChatContainer/>);
        expect(container.firstChild).toBeNull();
        await waitFor(() =>
            expect(routerPushMock).toHaveBeenCalledWith("/login"),
        );
    });
});

describe("ChatContainer — active chat selection", () => {
    it("auto-selects the first chat when one already exists", async () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.chats = [
            {
                id: "c1",
                title: "first",
                created_at: "x",
                updated_at: "y",
                is_shared: false,
            },
        ];
        render(<ChatContainer/>);
        await waitFor(() =>
            expect(chatListState.setActiveChatId).toHaveBeenCalledWith("c1"),
        );
        expect(chatListState.handleCreateChat).not.toHaveBeenCalled();
    });

    it("creates a new chat when the list is empty", async () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.chats = [];
        render(<ChatContainer/>);
        await waitFor(() =>
            expect(chatListState.handleCreateChat).toHaveBeenCalled(),
        );
    });

    it("does nothing while chats are still loading", () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.loading = true;
        render(<ChatContainer/>);
        expect(chatListState.setActiveChatId).not.toHaveBeenCalled();
        expect(chatListState.handleCreateChat).not.toHaveBeenCalled();
    });
});

describe("ChatContainer — message history loading", () => {
    it("calls loadMessages when an active chat is set", async () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.activeChatId = "c1";
        loadMessagesMock.mockResolvedValue([
            {
                id: "m1",
                role: "user",
                content: "hello",
                agents_used: [],
                created_at: "2026-04-27T10:00:00Z",
            },
            {
                id: "m2",
                role: "assistant",
                content: "hi back",
                agents_used: ["alpha"],
                created_at: "2026-04-27T10:00:01Z",
            },
        ]);
        render(<ChatContainer/>);
        await waitFor(() =>
            expect(loadMessagesMock).toHaveBeenCalledWith("c1"),
        );
        // Both bubbles surface once history finishes loading.
        await waitFor(() =>
            expect(screen.getByText("hello")).toBeInTheDocument(),
        );
        expect(screen.getByText("hi back")).toBeInTheDocument();
    });

    it("does not load history when no chat is active", () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.activeChatId = null;
        render(<ChatContainer/>);
        expect(loadMessagesMock).not.toHaveBeenCalled();
    });
});

describe("ChatContainer — drag overlay", () => {
    it("hides the overlay by default", () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.activeChatId = "c1";
        dragDropState.dragOver = false;
        render(<ChatContainer/>);
        expect(
            screen.queryByText(/Drop files to upload/i),
        ).not.toBeInTheDocument();
    });

    it("shows the overlay when the hook reports an active drag", async () => {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.activeChatId = "c1";
        dragDropState.dragOver = true;
        render(<ChatContainer/>);
        expect(
            screen.getByText(/Drop files to upload/i),
        ).toBeInTheDocument();
    });
});

describe("ChatContainer — message-send workflow", () => {
    function authedReady() {
        setSession({user: {name: "A"}}, "authenticated");
        chatListState.activeChatId = "c1";
    }

    async function sendText(text: string) {
        // Placeholder swaps when there are pending files — match either.
        const textarea = await waitFor(() => {
            const el =
                document.querySelector(
                    'textarea[placeholder="Type your message..."]',
                ) ??
                document.querySelector(
                    'textarea[placeholder="Describe what to do with the files..."]',
                );
            if (el === null) throw new Error("textarea not found yet");
            return el as HTMLTextAreaElement;
        });
        const userEvent = (await import("@testing-library/user-event")).default;
        const user = userEvent.setup();
        await user.type(textarea, text);
        await user.click(screen.getByLabelText("Send message"));
    }

    it("renders user content + assistant tokens as they stream in", async () => {
        authedReady();
        streamMessageMock.mockImplementation(
            async (
                _chatId: string,
                _msg: string,
                _files: File[] | null,
                cbs: {
                    onToken: (t: string) => void;
                    onDone: (
                        r: string,
                        a: string[],
                        ar: string[],
                    ) => void;
                },
            ) => {
                cbs.onToken("Hello ");
                cbs.onToken("there");
                cbs.onDone("Hello there", ["alpha"], []);
            },
        );

        render(<ChatContainer/>);
        await sendText("hi");

        await waitFor(() =>
            expect(screen.getByText("hi")).toBeInTheDocument(),
        );
        await waitFor(() =>
            expect(screen.getByText("Hello there")).toBeInTheDocument(),
        );
        // Agent badge surfaces.
        expect(screen.getByText("alpha")).toBeInTheDocument();
    });

    it("dispatches mcp-auth-needed when the API reports unauthorised servers", async () => {
        authedReady();
        const handler = vi.fn();
        window.addEventListener("mcp-auth-needed", handler as EventListener);
        try {
            streamMessageMock.mockImplementation(
                async (
                    _chatId: string,
                    _msg: string,
                    _files: File[] | null,
                    cbs: {
                        onDone: (
                            r: string,
                            a: string[],
                            ar: string[],
                        ) => void;
                    },
                ) => {
                    cbs.onDone("done", [], ["mcp-svc"]);
                },
            );
            render(<ChatContainer/>);
            await sendText("go");

            await waitFor(() =>
                expect(handler).toHaveBeenCalled(),
            );
            const evt = handler.mock.calls[0][0] as CustomEvent<{
                servers: string[];
            }>;
            expect(evt.detail.servers).toEqual(["mcp-svc"]);
        } finally {
            window.removeEventListener(
                "mcp-auth-needed",
                handler as EventListener,
            );
        }
    });

    it("emits a system bubble for status events with previews", async () => {
        authedReady();
        streamMessageMock.mockImplementation(
            async (
                _chatId: string,
                _msg: string,
                _files: File[] | null,
                cbs: {
                    onStatus: (a: string, s: string, p?: string) => void;
                    onDone: (
                        r: string,
                        a: string[],
                        ar: string[],
                    ) => void;
                },
            ) => {
                cbs.onStatus("alpha", "started");
                cbs.onStatus("alpha", "done", "result preview");
                // ``in_progress`` falls into the early-return branch.
                cbs.onStatus("alpha", "in_progress");
                cbs.onDone("final", ["alpha"], []);
            },
        );
        render(<ChatContainer/>);
        await sendText("ping");

        // Consecutive system bubbles are grouped — only the latest is
        // visible by default.  The grouping is verified explicitly in
        // the message-list spec; here we just assert the latest copy.
        await waitFor(() =>
            expect(screen.getByText(/alpha: result preview/i))
                .toBeInTheDocument(),
        );
    });

    it("emits a system bubble for handoff events", async () => {
        authedReady();
        streamMessageMock.mockImplementation(
            async (
                _chatId: string,
                _msg: string,
                _files: File[] | null,
                cbs: {
                    onHandoff: (c: string) => void;
                    onDone: (
                        r: string,
                        a: string[],
                        ar: string[],
                    ) => void;
                },
            ) => {
                cbs.onHandoff("handing off to beta");
                cbs.onDone("done", [], []);
            },
        );
        render(<ChatContainer/>);
        await sendText("ping");
        await waitFor(() =>
            expect(screen.getByText(/handing off to beta/i))
                .toBeInTheDocument(),
        );
    });

    it("forces a sign-out when an error contains 'Not authenticated'", async () => {
        authedReady();
        streamMessageMock.mockImplementation(
            async (
                _chatId: string,
                _msg: string,
                _files: File[] | null,
                cbs: {onError: (e: string) => void},
            ) => {
                cbs.onError("Not authenticated");
            },
        );
        render(<ChatContainer/>);
        await sendText("hi");
        await waitFor(() =>
            expect(signOutMock).toHaveBeenCalledWith({callbackUrl: "/login"}),
        );
    });

    it("renders an inline error message for non-auth errors", async () => {
        authedReady();
        streamMessageMock.mockImplementation(
            async (
                _chatId: string,
                _msg: string,
                _files: File[] | null,
                cbs: {onError: (e: string) => void},
            ) => {
                cbs.onError("upstream timeout");
            },
        );
        render(<ChatContainer/>);
        await sendText("hi");
        await waitFor(() =>
            expect(screen.getByText(/Error: upstream timeout/i))
                .toBeInTheDocument(),
        );
    });

    it("recovers gracefully when streamMessage throws", async () => {
        authedReady();
        streamMessageMock.mockRejectedValue(new Error("boom"));
        render(<ChatContainer/>);
        await sendText("hi");
        await waitFor(() =>
            expect(
                screen.getByText(/Sorry, something went wrong/i),
            ).toBeInTheDocument(),
        );
    });

    it("decorates the user bubble with attached file names", async () => {
        authedReady();
        // Pre-populate dropped files so the input picks them up.
        dragDropState.droppedFiles = [
            new File(["x"], "report.pdf", {type: "application/pdf"}),
        ];
        streamMessageMock.mockResolvedValue(undefined);
        render(<ChatContainer/>);
        await sendText("summarise");

        // Markdown italic _Attached: report.pdf_ surfaces in user bubble.
        await waitFor(() =>
            expect(screen.getByText(/Attached: report.pdf/i))
                .toBeInTheDocument(),
        );
    });
});
