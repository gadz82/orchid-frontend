/**
 * Tests for the chat input component.
 *
 * Coverage:
 * - Submitting trims the value, calls ``onSend``, and clears the input.
 * - Whitespace-only / empty inputs are no-ops.
 * - Enter submits, Shift+Enter inserts a newline.
 * - The submit button is disabled while typing nothing or while
 *   ``disabled`` / ``uploading`` is set.
 * - File picker selections are surfaced as pending file chips and
 *   merged with externally staged files (drag-drop).
 * - Removing a chip drops the right file from the right source array.
 */

import {describe, expect, it, vi} from "vitest";
import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {ChatInput} from "../chat-input";

function mkFile(name: string): File {
    return new File(["data"], name, {type: "text/plain"});
}

describe("ChatInput — sending text", () => {
    it("calls onSend with the trimmed value and clears the input", async () => {
        const onSend = vi.fn();
        render(<ChatInput onSend={onSend}/>);
        const user = userEvent.setup();

        const textarea = screen.getByPlaceholderText("Type your message...");
        await user.type(textarea, "  hello  ");
        await user.click(screen.getByLabelText("Send message"));

        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith("hello", []);
        expect((textarea as HTMLTextAreaElement).value).toBe("");
    });

    it("submits on Enter and inserts a newline on Shift+Enter", async () => {
        const onSend = vi.fn();
        render(<ChatInput onSend={onSend}/>);
        const user = userEvent.setup();

        const textarea = screen.getByPlaceholderText(
            "Type your message...",
        ) as HTMLTextAreaElement;

        await user.type(textarea, "first{Shift>}{Enter}{/Shift}second");
        // Newline added but no submit yet.
        expect(textarea.value).toBe("first\nsecond");
        expect(onSend).not.toHaveBeenCalled();

        await user.type(textarea, "{Enter}");
        expect(onSend).toHaveBeenCalledWith("first\nsecond", []);
    });

    it("does nothing when submitted with whitespace-only content", async () => {
        const onSend = vi.fn();
        render(<ChatInput onSend={onSend}/>);
        const user = userEvent.setup();
        await user.type(screen.getByPlaceholderText("Type your message..."), "  ");
        // The send button is also disabled in this state — exercise the
        // ``handleSubmit`` early-return via Enter instead.
        await user.keyboard("{Enter}");
        expect(onSend).not.toHaveBeenCalled();
    });

    it("disables the send button when the input is empty", () => {
        render(<ChatInput onSend={vi.fn()}/>);
        expect(screen.getByLabelText("Send message")).toBeDisabled();
    });

    it("disables both buttons while ``disabled`` is true", () => {
        render(<ChatInput onSend={vi.fn()} disabled/>);
        expect(screen.getByLabelText("Send message")).toBeDisabled();
        expect(screen.getByLabelText("Attach files")).toBeDisabled();
    });

    it("disables both buttons while ``uploading`` is true", () => {
        render(<ChatInput onSend={vi.fn()} uploading/>);
        expect(screen.getByLabelText("Send message")).toBeDisabled();
        expect(screen.getByLabelText("Attach files")).toBeDisabled();
    });

    it("does not call onSend while ``disabled``", async () => {
        const onSend = vi.fn();
        render(<ChatInput onSend={onSend} disabled/>);
        const textarea = screen.getByPlaceholderText("Type your message...");
        // Even with text, ``handleSubmit`` early-returns when disabled.
        await userEvent.setup().type(textarea, "hi");
        // Textarea is disabled, but exercise Enter just to be sure the
        // guard inside handleSubmit short-circuits.
        await userEvent.setup().keyboard("{Enter}");
        expect(onSend).not.toHaveBeenCalled();
    });
});

describe("ChatInput — pending file chips", () => {
    it("shows external files as chips immediately", () => {
        render(
            <ChatInput
                onSend={vi.fn()}
                externalFiles={[mkFile("dropped.pdf")]}
            />,
        );
        expect(screen.getByText("dropped.pdf")).toBeInTheDocument();
        // Placeholder switches to the "files attached" copy.
        expect(
            screen.getByPlaceholderText("Describe what to do with the files..."),
        ).toBeInTheDocument();
    });

    it("forwards externalFiles + locally selected files to onSend together", async () => {
        const onSend = vi.fn();
        const onExternalFilesChange = vi.fn();
        const external = mkFile("dropped.pdf");
        render(
            <ChatInput
                onSend={onSend}
                externalFiles={[external]}
                onExternalFilesChange={onExternalFilesChange}
            />,
        );
        const user = userEvent.setup();

        // Surface the hidden ``<input type="file">`` and feed it a file.
        const fileInput = document.querySelector(
            'input[type="file"]',
        ) as HTMLInputElement;
        const local = mkFile("local.txt");
        await user.upload(fileInput, local);

        expect(screen.getByText("dropped.pdf")).toBeInTheDocument();
        expect(screen.getByText("local.txt")).toBeInTheDocument();

        await user.type(
            screen.getByPlaceholderText("Describe what to do with the files..."),
            "summarise these",
        );
        await user.click(screen.getByLabelText("Send message"));

        // ``pendingFiles`` is local first, then external — the
        // implementation merges them in that order.
        expect(onSend).toHaveBeenCalledWith("summarise these", [local, external]);
        // External files are cleared via the callback after submit.
        expect(onExternalFilesChange).toHaveBeenLastCalledWith([]);
    });

    it("removing an external chip calls onExternalFilesChange with the survivors", async () => {
        const onExternalFilesChange = vi.fn();
        render(
            <ChatInput
                onSend={vi.fn()}
                externalFiles={[mkFile("a.pdf"), mkFile("b.pdf")]}
                onExternalFilesChange={onExternalFilesChange}
            />,
        );
        const user = userEvent.setup();
        const removeButtons = document.querySelectorAll(
            ".bg-orchid-card button",
        );
        // Two chips → two remove buttons.
        expect(removeButtons.length).toBe(2);
        await user.click(removeButtons[1] as HTMLButtonElement);
        // The second chip gets dropped — callback receives only the first.
        const lastCall = onExternalFilesChange.mock.calls.at(-1)?.[0] as File[];
        expect(lastCall).toHaveLength(1);
        expect(lastCall[0].name).toBe("a.pdf");
    });
});
