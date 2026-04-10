/**
 * Animated typing indicator — three bouncing dots with orchid glow.
 */
export function LoadingIndicator() {
    return (
        <div className="flex items-center gap-1 px-4 py-3">
            <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        className="h-2 w-2 rounded-full bg-orchid-accent animate-bounce"
                        style={{animationDelay: `${i * 150}ms`}}
                    />
                ))}
            </div>
            <span className="ml-2 text-xs text-orchid-muted">Thinking...</span>
        </div>
    );
}
