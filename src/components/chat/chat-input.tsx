"use client";

import {useState, useRef, useCallback} from "react";
import {Send, Paperclip, X, FileText, Loader2} from "lucide-react";

interface ChatInputProps {
    onSend: (message: string, files: File[]) => void;
    disabled?: boolean;
    uploading?: boolean;
    /** Externally staged files (e.g. from drag-and-drop) */
    externalFiles?: File[];
    onExternalFilesChange?: (files: File[]) => void;
}

import {ACCEPTED_INPUT_STRING as ACCEPTED} from "@/lib/constants";

/**
 * Chat input with auto-resize textarea, send button, and file attachment.
 *
 * Files are staged locally until the user submits a message.
 * The parent is responsible for uploading and sending.
 */
export function ChatInput({
                              onSend,
                              disabled,
                              uploading,
                              externalFiles = [],
                              onExternalFilesChange,
                          }: ChatInputProps) {
    const [value, setValue] = useState("");
    const [localFiles, setLocalFiles] = useState<File[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Merge local and external (drag-and-drop) files
    const pendingFiles = [...localFiles, ...externalFiles];

    const handleSubmit = useCallback(() => {
        const trimmed = value.trim();
        if (!trimmed || disabled) return;

        onSend(trimmed, pendingFiles);
        setValue("");
        setLocalFiles([]);
        onExternalFilesChange?.([]);
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    }, [value, disabled, onSend, pendingFiles, onExternalFilesChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            setLocalFiles((prev) => [...prev, ...files]);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const removePendingFile = (index: number) => {
        if (index < localFiles.length) {
            setLocalFiles((prev) => prev.filter((_, i) => i !== index));
        } else {
            const extIndex = index - localFiles.length;
            const updated = externalFiles.filter((_, i) => i !== extIndex);
            onExternalFilesChange?.(updated);
        }
    };

    return (
        <div className="border-t border-orchid-border bg-orchid-surface/50 px-4 py-3 backdrop-blur-sm">
            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                    {pendingFiles.map((file, i) => (
                        <div
                            key={`${file.name}-${i}`}
                            className="flex items-center gap-1.5 rounded-lg border border-orchid-border bg-orchid-card px-2.5 py-1.5 text-xs text-orchid-text"
                        >
                            <FileText className="h-3.5 w-3.5 text-orchid-muted"/>
                            <span className="max-w-[150px] truncate">{file.name}</span>
                            <button
                                onClick={() => removePendingFile(i)}
                                className="rounded p-0.5 text-orchid-muted hover:text-red-400"
                            >
                                <X className="h-3 w-3"/>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-2">
                {/* Attachment button */}
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled || uploading}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                     border border-orchid-border text-orchid-muted transition-colors
                     hover:bg-orchid-card hover:text-orchid-text
                     disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Attach files"
                    title="Upload documents"
                >
                    {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin"/>
                    ) : (
                        <Paperclip className="h-4 w-4"/>
                    )}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPTED}
                    onChange={handleFileSelect}
                    className="hidden"
                />

                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        pendingFiles.length > 0
                            ? "Describe what to do with the files..."
                            : "Type your message..."
                    }
                    disabled={disabled || uploading}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-orchid-border bg-orchid-card
                     px-4 py-2.5 text-sm text-orchid-text placeholder:text-orchid-muted/60
                     focus:border-orchid-accent focus:outline-none focus:ring-2
                     focus:ring-orchid-accent/20 transition-colors disabled:opacity-50"
                />
                <button
                    onClick={handleSubmit}
                    disabled={disabled || uploading || !value.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl
                     bg-orchid-accent text-white transition-all
                     hover:bg-orchid-accent-hover hover:shadow-glow disabled:opacity-40
                     disabled:cursor-not-allowed"
                    aria-label="Send message"
                >
                    <Send className="h-4 w-4"/>
                </button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-orchid-muted/60">
                Press Enter to send, Shift+Enter for new line
            </p>
        </div>
    );
}
