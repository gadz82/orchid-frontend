/**
 * Tests for the message list scroller.
 *
 * Coverage:
 * - Empty state shows the welcome card.
 * - Loading indicator appears only while ``isLoading`` is true.
 * - System messages are grouped — only the latest visible by default.
 * - Clicking the chevron reveals previous system messages.
 * - User and assistant messages render their content verbatim.
 */

import {describe, expect, it, vi, beforeAll} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {MessageList} from "../message-list";
import type {Message} from "../message-bubble";

beforeAll(() => {
    // jsdom doesn't implement scrollIntoView; the list calls it on mount.
    Element.prototype.scrollIntoView = vi.fn();
});

const ts = new Date("2026-04-27T10:00:00Z");

function bubble(role: Message["role"], id: string, content: string): Message {
    return {id, role, content, timestamp: ts};
}

describe("MessageList — empty state", () => {
    it("shows the welcome card when no messages exist and not loading", () => {
        render(<MessageList messages={[]} isLoading={false}/>);
        expect(screen.getByText(/How can I help you today/i)).toBeInTheDocument();
        expect(
            screen.getByText(/Ask me anything to get started/i),
        ).toBeInTheDocument();
    });

    it("hides the welcome card when ``isLoading`` is true", () => {
        render(<MessageList messages={[]} isLoading={true}/>);
        expect(
            screen.queryByText(/How can I help you today/i),
        ).not.toBeInTheDocument();
        expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });
});

describe("MessageList — message rendering", () => {
    it("renders each user / assistant message in order", () => {
        const messages: Message[] = [
            bubble("user", "1", "first"),
            bubble("assistant", "2", "second"),
            bubble("user", "3", "third"),
        ];
        render(<MessageList messages={messages} isLoading={false}/>);
        expect(screen.getByText("first")).toBeInTheDocument();
        expect(screen.getByText("second")).toBeInTheDocument();
        expect(screen.getByText("third")).toBeInTheDocument();
    });

    it("appends the loading indicator at the end while loading", () => {
        const messages: Message[] = [bubble("user", "1", "go")];
        render(<MessageList messages={messages} isLoading={true}/>);
        expect(screen.getByText("Thinking...")).toBeInTheDocument();
    });
});

describe("MessageList — system message grouping", () => {
    it("collapses consecutive system messages to the latest one", () => {
        const messages: Message[] = [
            bubble("system", "1", "alpha started"),
            bubble("system", "2", "beta started"),
            bubble("system", "3", "gamma started"),
        ];
        render(<MessageList messages={messages} isLoading={false}/>);
        // Only the last one is visible by default.
        expect(screen.getByText("gamma started")).toBeInTheDocument();
        expect(screen.queryByText("alpha started")).not.toBeInTheDocument();
        expect(screen.queryByText("beta started")).not.toBeInTheDocument();
    });

    it("expands prior system messages when the chevron is clicked", async () => {
        const messages: Message[] = [
            bubble("system", "1", "alpha started"),
            bubble("system", "2", "beta started"),
            bubble("system", "3", "gamma started"),
        ];
        render(<MessageList messages={messages} isLoading={false}/>);
        const user = userEvent.setup();

        await user.click(screen.getByText("gamma started"));

        expect(screen.getByText("alpha started")).toBeInTheDocument();
        expect(screen.getByText("beta started")).toBeInTheDocument();
        expect(screen.getByText("gamma started")).toBeInTheDocument();
    });

    it("does not toggle expansion when there is only a single system message", async () => {
        const messages: Message[] = [bubble("system", "1", "only-status")];
        const {container} = render(
            <MessageList messages={messages} isLoading={false}/>,
        );
        const user = userEvent.setup();
        // No chevron rendered when the group has a single entry.
        expect(container.querySelector("svg.lucide-chevron-down")).toBeNull();
        await user.click(screen.getByText("only-status"));
        // Still no chevron / expansion.
        expect(container.querySelector("svg.lucide-chevron-down")).toBeNull();
    });

    it("re-flushes a system group when interrupted by a non-system message", () => {
        const messages: Message[] = [
            bubble("system", "1", "one started"),
            bubble("user", "2", "user-text"),
            bubble("system", "3", "two started"),
        ];
        render(<MessageList messages={messages} isLoading={false}/>);
        // Both system messages survive because each is in its own group.
        expect(screen.getByText("one started")).toBeInTheDocument();
        expect(screen.getByText("user-text")).toBeInTheDocument();
        expect(screen.getByText("two started")).toBeInTheDocument();
    });
});
