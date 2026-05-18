import {Sparkles, User} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {OrchidIcon} from "@/components/icons/orchid-icon";

export interface Message {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    agentsUsed?: string[];
    timestamp: Date;
    /**
     * Backend-supplied metadata (§25.5).  When ``metadata.origin``
     * is ``"bloom"`` the bubble is decorated with a sparkles badge
     * + tooltip + link to the originating run, distinguishing
     * Bloom-originated messages from real-time turns.
     */
    metadata?: Record<string, unknown> | null;
    /**
     * Indicates the message was cancelled by the user during streaming.
     * The message content reflects the partial response generated
     * before cancellation.
     */
    cancelled?: boolean;
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
    const bloom = readBloomMetadata(message.metadata);

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
                        className="prose prose-sm prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium [&_pre]:bg-orchid-card [&_pre]:rounded-lg [&_pre]:p-2 [&_pre]:border [&_pre]:border-orchid-border [&_code]:text-xs [&_code]:bg-orchid-card [&_code]:rounded [&_code]:px-1 [&_code]:text-orchid-accent-glow [&_a]:text-orchid-accent [&_a]:underline [&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-orchid-border [&_th]:bg-orchid-card [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-orchid-border [&_td]:px-2 [&_td]:py-1 [&_td]:align-top">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                )}

                {/* Bloom-origin badge (§25.6) */}
                {bloom !== null && (
                    <div
                        className="mt-2 flex items-center gap-1.5 rounded-md bg-orchid-accent/10 px-2 py-1 text-[11px] text-orchid-accent-glow"
                        title={
                            bloom.deliveredAt !== null
                                ? `From background work · run ${bloom.runId} · delivered ${bloom.deliveredAt}`
                                : `From background work · run ${bloom.runId}`
                        }
                        aria-label="Bloom-originated message"
                    >
                        <Sparkles className="h-3 w-3" />
                        <span>
                            From background work
                            {bloom.triggerId !== null && (
                                <>
                                    {" · "}trigger {bloom.triggerId}
                                </>
                            )}
                            {" · "}
                            <Link
                                href={`/bloom/runs/${bloom.runId}`}
                                className="underline"
                            >
                                view run
                            </Link>
                        </span>
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

                 {/* Cancelled badge */}
                 {message.cancelled && (
                     <p className="mt-1 inline-block rounded bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400/60">
                         cancelled
                     </p>
                 )}
                 
                 {/* Timestamp */}
                 <p className="mt-1 text-[10px] text-orchid-muted/60">
                     {message.timestamp.toLocaleTimeString([], {
                         hour: "2-digit",
                         minute: "2-digit",
                     })}
                 </p>
            </div>
        </div>
    );
}

/* ── Bloom-origin metadata extractor (§25.5) ───────────────── */

interface BloomMetadata {
    runId: string;
    triggerId: string | null;
    deliveredAt: string | null;
    failed: boolean;
}

/**
 * Detect a Bloom-originated message and project the parts the badge
 * needs out of the metadata bag.  Returns ``null`` for normal
 * (real-time) messages so the badge isn't rendered.
 */
export function readBloomMetadata(
    metadata: Record<string, unknown> | null | undefined,
): BloomMetadata | null {
    if (metadata === null || metadata === undefined) return null;
    if (metadata.origin !== "bloom") return null;
    const runId = typeof metadata.bloom_run_id === "string" ? metadata.bloom_run_id : null;
    if (runId === null || runId === "") return null;
    return {
        runId,
        triggerId:
            typeof metadata.trigger_id === "string" ? metadata.trigger_id : null,
        deliveredAt:
            typeof metadata.delivered_at === "string"
                ? metadata.delivered_at
                : null,
        failed: metadata.status === "failed",
    };
}
