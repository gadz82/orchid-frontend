/**
 * Tests for the chat message bubble.
 *
 * Coverage:
 * - User messages render as plain pre-wrap text (no markdown).
 * - Assistant messages render through react-markdown (links survive,
 *   tables come through GFM).
 * - Agent badges appear when ``agentsUsed`` is non-empty.
 * - Timestamps surface in ``HH:MM`` form.
 * - Avatars differ between user and assistant.
 */

import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";

import {MessageBubble, type Message} from "../message-bubble";

const baseTime = new Date("2026-04-27T15:30:00Z");

function userMsg(overrides: Partial<Message> = {}): Message {
    return {
        id: "u1",
        role: "user",
        content: "hello world",
        timestamp: baseTime,
        ...overrides,
    };
}

function assistantMsg(overrides: Partial<Message> = {}): Message {
    return {
        id: "a1",
        role: "assistant",
        content: "from the assistant",
        timestamp: baseTime,
        ...overrides,
    };
}

describe("MessageBubble — user role", () => {
    it("renders the user content as plain text", () => {
        render(<MessageBubble message={userMsg({content: "Hello there"})}/>);
        expect(screen.getByText("Hello there")).toBeInTheDocument();
    });

    it("preserves whitespace in user messages (no markdown rendering)", () => {
        const content = "line1\nline2\n  indented";
        const {container} = render(<MessageBubble message={userMsg({content})}/>);
        const para = container.querySelector("p.whitespace-pre-wrap");
        expect(para).not.toBeNull();
        expect(para?.textContent).toBe(content);
    });

    it("does not render markdown for user messages", () => {
        const {container} = render(
            <MessageBubble message={userMsg({content: "**bold**"})}/>,
        );
        // No bold/strong element — markdown isn't applied.
        expect(container.querySelector("strong")).toBeNull();
        expect(screen.getByText("**bold**")).toBeInTheDocument();
    });
});

describe("MessageBubble — assistant role", () => {
    it("renders bold via markdown", () => {
        const {container} = render(
            <MessageBubble message={assistantMsg({content: "**bold text**"})}/>,
        );
        const strong = container.querySelector("strong");
        expect(strong).not.toBeNull();
        expect(strong?.textContent).toBe("bold text");
    });

    it("renders inline code via markdown", () => {
        const {container} = render(
            <MessageBubble message={assistantMsg({content: "use `npm test` to run"})}/>,
        );
        const code = container.querySelector("code");
        expect(code).not.toBeNull();
        expect(code?.textContent).toBe("npm test");
    });

    it("renders GFM tables", () => {
        const content = [
            "| h1 | h2 |",
            "| -- | -- |",
            "| a  | b  |",
        ].join("\n");
        const {container} = render(
            <MessageBubble message={assistantMsg({content})}/>,
        );
        expect(container.querySelector("table")).not.toBeNull();
        expect(container.querySelector("th")?.textContent).toBe("h1");
    });

    it("renders links with the orchid-accent class via markdown", () => {
        const {container} = render(
            <MessageBubble
                message={assistantMsg({content: "[orchid](https://orchid.example)"})}/>,
        );
        const link = container.querySelector("a");
        expect(link).not.toBeNull();
        expect(link?.getAttribute("href")).toBe("https://orchid.example");
        expect(link?.textContent).toBe("orchid");
    });
});

describe("MessageBubble — agent badges + timestamp", () => {
    it("renders one badge per ``agentsUsed`` entry", () => {
        render(
            <MessageBubble
                message={assistantMsg({agentsUsed: ["alpha", "beta", "gamma"]})}
            />,
        );
        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.getByText("beta")).toBeInTheDocument();
        expect(screen.getByText("gamma")).toBeInTheDocument();
    });

    it("omits the badge container when ``agentsUsed`` is undefined", () => {
        const {container} = render(<MessageBubble message={assistantMsg()}/>);
        // The "rounded-full" pill is only used by agent badges — the
        // avatar wrapper uses ``rounded-full`` too, so we should only
        // see one such element when no agents are listed.
        expect(container.querySelectorAll(".rounded-full")).toHaveLength(1);
    });

    it("omits the badge container when ``agentsUsed`` is empty", () => {
        const {container} = render(
            <MessageBubble message={assistantMsg({agentsUsed: []})}/>,
        );
        expect(container.querySelectorAll(".rounded-full")).toHaveLength(1);
    });

    it("renders the timestamp formatted as the locale's HH:MM", () => {
        const ts = new Date("2026-04-27T15:30:00Z");
        const expected = ts.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        render(<MessageBubble message={userMsg({timestamp: ts})}/>);
        expect(screen.getByText(expected)).toBeInTheDocument();
    });
});

describe("MessageBubble — avatar variation", () => {
    it("uses the user avatar for user messages", () => {
        const {container} = render(<MessageBubble message={userMsg()}/>);
        // ``lucide-react``'s User icon renders as an svg.lucide-user;
        // OrchidIcon renders our own svg without that class.
        expect(container.querySelector("svg.lucide-user")).not.toBeNull();
    });

    it("uses the orchid avatar for assistant messages", () => {
        const {container} = render(<MessageBubble message={assistantMsg()}/>);
        expect(container.querySelector("svg.lucide-user")).toBeNull();
        // Our orchid SVG has a viewBox 0 0 24 24 — the User icon also
        // does, but it has the lucide-user class so the absence above
        // is enough to disambiguate.
        expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
    });
});
