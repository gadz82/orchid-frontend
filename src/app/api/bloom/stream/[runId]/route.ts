/**
 * SSE proxy for ``GET /runs/{runId}/stream`` — Phase F2.
 *
 * The browser cannot open an authenticated ``EventSource`` directly
 * against ``orchid-api`` because ``EventSource`` does NOT support a
 * custom ``Authorization`` header.  Same-origin proxying solves the
 * problem: the browser opens ``EventSource`` against this Next.js
 * route, which resolves the NextAuth bearer server-side and forwards
 * the request to ``orchid-api`` over HTTP, then streams the response
 * body back unchanged.
 *
 * Visibility (§26) is enforced upstream — this route trusts whatever
 * ``orchid-api`` decides.  A 404 from upstream surfaces as a 404
 * here; a 401 is converted to a 401 (browser closes the SSE).
 */

import {NextRequest} from "next/server";

import {auth} from "@/lib/auth/auth";
import {AGENTS_API_URL} from "@/app/actions/_api-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
    request: NextRequest,
    context: {params: Promise<{runId: string}>},
): Promise<Response> {
    const {runId} = await context.params;
    const session = await auth();
    const token = session?.accessToken;
    if (!token) {
        return new Response("unauthorized", {status: 401});
    }

    const upstreamUrl = `${AGENTS_API_URL}/runs/${encodeURIComponent(runId)}/stream`;

    // Forward client-side cancellation (component unmount,
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
