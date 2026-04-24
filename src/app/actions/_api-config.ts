/**
 * API configuration constants — plain module (NOT "use server").
 *
 * Separated from ``_api-client.ts`` because Next.js Server Action files
 * can only export async functions, not constants.
 *
 * The default uses ``127.0.0.1`` instead of ``localhost`` deliberately.
 * Node 20+ ``fetch`` (undici) does dual-stack DNS resolution and prefers
 * IPv6 ``::1`` for ``localhost`` — but Docker Desktop on macOS publishes
 * container ports on IPv4 only by default, so an IPv6 attempt returns
 * ECONNREFUSED.  Pinning to ``127.0.0.1`` skips the IPv6 leg entirely.
 * If a caller really wants dual-stack, they can still set
 * ``AGENTS_API_URL=http://localhost:8000`` in the environment.
 */

export const AGENTS_API_URL =
    process.env.AGENTS_API_URL ?? "http://127.0.0.1:8000";
