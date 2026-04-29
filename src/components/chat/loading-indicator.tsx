/**
 * Animated typing indicator — three bouncing dots with orchid glow.
 */
const _DOT_KEYS = ["dot-a", "dot-b", "dot-c"] as const;

export function LoadingIndicator() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            <div className="flex gap-1">
                {_DOT_KEYS.map((key, i) => (
                    <span
                        key={key}
                        className="h-2 w-2 rounded-full bg-orchid-accent animate-bounce"
                        style={{animationDelay: `${i * 150}ms`}}
                    />
                ))}
            </div>
            <span className="ml-2 text-xs text-orchid-muted">Thinking...</span>
        </div>
    );
}
