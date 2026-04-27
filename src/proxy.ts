/**
 * Auth proxy — protect /chat routes.
 *
 * Renamed from ``middleware.ts`` to ``proxy.ts`` for Next.js 16
 * (the previous filename is deprecated).  The export must be a
 * **function declaration** named ``proxy`` (or a default function
 * declaration); Next.js 16's static analyser walks the AST and
 * rejects everything else — including ``export const proxy = ...``
 * (a variable declaration) and ``export default auth(...)`` (a call
 * expression).  The error surfaces as:
 *
 *     The Proxy file "/proxy" must export a function named `proxy`
 *     or a default function.
 *
 * The Auth.js v5 ``auth()`` wrapper returns a function — at runtime
 * it injects ``req.auth`` before our callback runs — but the
 * analyser can't see through the call.  We bind the wrapped
 * handler to a module-private const, then re-expose it through a
 * top-level ``function proxy(...)`` declaration that the analyser
 * accepts.  No runtime cost; one extra stack frame per request.
 *
 * Unauthenticated users hitting any matched route get redirected to
 * ``/login``; authenticated users on ``/login`` get punted forward
 * to ``/chat``.
 */
import {auth} from "@/lib/auth/auth";
import {NextResponse} from "next/server";

// In Auth.js v5, ``auth(callback)`` returns a real function ONLY
// when the config passed to ``NextAuth(...)`` was a sync object.
// We use the async-config builder (lazy ``/auth-info`` discovery on
// the first request — see ``lib/auth/auth.ts``), which makes
// ``initAuth`` return ``async (...args) => ...``.  The whole call
// site is therefore async — ``auth(callback)`` is a *Promise* that
// resolves to the actual middleware handler.  Capturing it as
// ``const handler = auth(...)`` then calling ``handler(req, ev)``
// blew up with "handler is not a function" because we were calling
// a Promise.
//
// Fix: keep the Promise reference, ``await`` it on every entry into
// the proxy.  After the first await it's already resolved so
// subsequent awaits are a microtask hop — negligible compared with
// the actual session lookup that follows.
const handlerPromise = auth((req) => {
    const isAuthenticated = !!req.auth;
    const isLoginPage = req.nextUrl.pathname === "/login";

    // If not authenticated and trying to access protected route, redirect to login
    if (!isAuthenticated && !isLoginPage) {
        return NextResponse.redirect(new URL("/login", req.url));
    }

    // If authenticated and on login page, redirect to chat
    if (isAuthenticated && isLoginPage) {
        return NextResponse.redirect(new URL("/chat", req.url));
    }

    return NextResponse.next();
});

type Handler = Awaited<typeof handlerPromise>;

export async function proxy(...args: Parameters<Handler>) {
    const handler = await handlerPromise;
    return handler(...args);
}

export const config = {
    matcher: ["/chat/:path*", "/chat"],
};
