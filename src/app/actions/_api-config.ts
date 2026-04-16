/**
 * API configuration constants — plain module (NOT "use server").
 *
 * Separated from ``_api-client.ts`` because Next.js Server Action files
 * can only export async functions, not constants.
 */

export const AGENTS_API_URL =
    process.env.AGENTS_API_URL ?? "http://localhost:8000";
