"use server";

/**
 * Shared server-action helpers for API calls.
 *
 * "use server" files can only export async functions (no constants).
 * The API base URL lives in ``_api-config.ts`` (a plain module).
 */

import {auth, signOut} from "@/lib/auth/auth";
import {redirect} from "next/navigation";

/**
 * Build request headers with the NextAuth JWT bearer token.
 *
 * If the session is in the ``RefreshAccessTokenError`` state (the
 * refresh-token flow in ``lib/auth/auth.ts`` failed), we short-circuit
 * here and force a fresh login rather than sending an
 * already-known-bad token to the backend.  The NEXT_REDIRECT thrown
 * by ``handleUnauthorized`` propagates out of the Server Action so
 * the caller doesn't have to special-case it — provided the caller's
 * catch block uses ``unstable_rethrow``.
 */
export async function getHeaders(): Promise<Record<string, string>> {
    const session = await auth();
    if (session?.error === "RefreshAccessTokenError") {
        await handleUnauthorized();
    }
    const token = session?.accessToken;
    return {
        "Content-Type": "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
}

/**
 * Build auth-only headers (no Content-Type) for multipart requests.
 *
 * Mirrors :func:`getHeaders` — triggers :func:`handleUnauthorized` when
 * the session is in refresh-error state.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
    const session = await auth();
    if (session?.error === "RefreshAccessTokenError") {
        await handleUnauthorized();
    }
    const token = session?.accessToken;
    return token ? {Authorization: `Bearer ${token}`} : {};
}

/**
 * Handle 401 from the backend: destroy the NextAuth session and
 * redirect to the login page.
 *
 * ``redirect()`` throws a ``NEXT_REDIRECT`` error that Next.js
 * intercepts at the Server Action boundary to turn into a browser
 * redirect.  That signal is EASY to swallow by accident — a bare
 * ``try { ... } catch { return [] }`` around the caller consumes the
 * NEXT_REDIRECT and strands the user on a broken page.  Callers MUST
 * call ``unstable_rethrow(err)`` from ``next/navigation`` at the top of
 * every catch block that wraps a ``handleUnauthorized()`` call site.
 */
export async function handleUnauthorized(): Promise<never> {
    await signOut({redirect: false});
    redirect("/login");
}
