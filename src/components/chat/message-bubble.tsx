import {User} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {OrchidIcon} from "@/components/icons/orchid-icon";

export interface Message {
    id: string;
    role: "user" | "assistant";
    content: string;
    agentsUsed?: string[];
    timestamp: Date;
}

interface MessageBubbleProps {
    message: Message;
}

/**
 * Single chat message bubble — user messages on the right, assistant on the left.
 * Assistant messages are rendered as Markdown.
 */
export function MessageBubble({message}: MessageBubbleProps) {
    const isUser = message.role === "user";

    return (
        <div
            className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
        >
            {/* Avatar */}
            <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full
          ${isUser ? "bg-orchid-user-bubble" : "bg-orchid-accent/20"}`}
            >
                {isUser ? (
                    <User className="h-4 w-4 text-orchid-muted"/>
                ) : (
                    <OrchidIcon size={18} className="text-orchid-accent-glow"/>
                )}
            </div>

            {/* Bubble */}
            <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed
          ${
                    isUser
                        ? "bg-orchid-user-bubble text-orchid-text rounded-br-md"
                        : "bg-orchid-assistant-bubble text-orchid-text rounded-bl-md border border-orchid-border"
                }`}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div
                        className="prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium [&_pre]:bg-orchid-card [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:border [&_pre]:border-orchid-border [&_code]:text-xs [&_code]:bg-orchid-card [&_code]:rounded [&_code]:px-1 [&_code]:text-orchid-accent-glow [&_a]:text-orchid-accent [&_a]:underline">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                )}

                {/* Agent badges */}
                {message.agentsUsed && message.agentsUsed.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {message.agentsUsed.map((agent) => (
                            <span
                                key={agent}
                                className="inline-block rounded-full bg-orchid-accent/15 px-2 py-0.5
                           text-[10px] font-medium text-orchid-accent-glow"
                            >
                {agent}
              </span>
                        ))}
                    </div>
                )}

                {/* Timestamp */}
                <p
                    className={`mt-1 text-[10px] ${
                        isUser ? "text-orchid-muted/60" : "text-orchid-muted/60"
                    }`}
                >
                    {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            </div>
        </div>
    );
}
