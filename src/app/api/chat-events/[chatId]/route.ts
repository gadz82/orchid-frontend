/**
 * SSE proxy for ``GET /chats/{chatId}/events/stream`` — Phase F2.5.
 *
 * Mirrors the per-run ``api/bloom/stream/[runId]/route.ts`` proxy:
 * the browser opens an ``EventSource`` against this Next.js route,
 * which resolves the NextAuth bearer server-side and forwards the
 * request to ``orchid-api`` with ``Authorization: Bearer …``.
 *
 * Authorization (§26.6, restated for the chat-channel endpoint by
 * §LS9): non-owner / cross-tenant callers receive 404, never 403.
 * The contract is enforced upstream by ``require_chat_owner_or_admin``;
 * this proxy re-emits the upstream status verbatim.
 */

import {NextRequest} from "next/server";

import {auth} from "@/lib/auth/auth";
import {AGENTS_API_URL} from "@/app/actions/_api-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    context: {params: Promise<{chatId: string}>},
): Promise<Response> {
    const {chatId} = await context.params;
    const session = await auth();
    const token = session?.accessToken;
    if (!token) {
        return new Response("unauthorized", {status: 401});
    }

    const upstreamUrl = `${AGENTS_API_URL}/chats/${encodeURIComponent(chatId)}/events/stream`;

    // Forward client-side cancellation (tab close, hook unmount,
    // ``EventSource.close()``) to the upstream connection.
    const upstream = await fetch(upstreamUrl, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
        },
        signal: request.signal,
        cache: "no-store",
    });

    if (!upstream.ok || upstream.body === null) {
        const text = upstream.body === null ? "" : await upstream.text();
        return new Response(text || `upstream error ${upstream.status}`, {
            status: upstream.status,
        });
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            Connection: "keep-alive",
        },
    });
}
