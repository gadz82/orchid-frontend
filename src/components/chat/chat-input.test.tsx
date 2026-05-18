import {render, screen, fireEvent} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {ChatInput} from "./chat-input";

describe("ChatInput — stop button", () => {
    it("renders send button when isLoading is false", () => {
        render(<ChatInput onSend={vi.fn()} />);
        expect(screen.getByLabelText("Send message")).toBeDefined();
        expect(screen.queryByTitle("Stop generation")).toBeNull();
    });

    it("renders stop button when isLoading and onCancel are set", () => {
        render(<ChatInput onSend={vi.fn()} onCancel={vi.fn()} isLoading={true} />);
        expect(screen.getByTitle("Stop generation")).toBeDefined();
        expect(screen.queryByLabelText("Send message")).toBeNull();
    });

    it("renders send button when isLoading is true but onCancel is not provided", () => {
        render(<ChatInput onSend={vi.fn()} isLoading={true} />);
        expect(screen.getByLabelText("Send message")).toBeDefined();
        expect(screen.queryByTitle("Stop generation")).toBeNull();
    });

    it("calls onCancel when stop button is clicked", () => {
        const onCancel = vi.fn();
        render(<ChatInput onSend={vi.fn()} onCancel={onCancel} isLoading={true} />);
        fireEvent.click(screen.getByTitle("Stop generation"));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("disables textarea when disabled is true", () => {
        render(<ChatInput onSend={vi.fn()} disabled={true} />);
        expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    });

    it("disables send button when disabled is true", () => {
        render(
            <ChatInput onSend={vi.fn()} disabled={true} />,
        );
        const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
        // Set a value so the send button isn't disabled by empty text
        fireEvent.change(textbox, {target: {value: "hello"}});
        const btn = screen.getByLabelText("Send message");
        expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("disables send button when no text is entered", () => {
        render(<ChatInput onSend={vi.fn()} />);
        const btn = screen.getByLabelText("Send message");
        expect(btn.hasAttribute("disabled")).toBe(true);
    });

    it("calls onSend with the message text on submit", () => {
        const onSend = vi.fn();
        render(<ChatInput onSend={onSend} />);
        const textbox = screen.getByRole("textbox") as HTMLTextAreaElement;
        fireEvent.change(textbox, {target: {value: "test message"}});
        fireEvent.click(screen.getByLabelText("Send message"));
        expect(onSend).toHaveBeenCalledWith("test message", []);
    });
});
