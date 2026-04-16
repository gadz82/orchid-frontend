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
 */
export async function getHeaders(): Promise<Record<string, string>> {
    const session = await auth();
    const token = session?.accessToken;
    return {
        "Content-Type": "application/json",
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
    };
}

/**
 * Build auth-only headers (no Content-Type) for multipart requests.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
    const session = await auth();
    const token = session?.accessToken;
    return token ? {Authorization: `Bearer ${token}`} : {};
}

/**
 * Handle 401 from the backend: destroy the NextAuth session and
 * redirect to the login page.
 */
export async function handleUnauthorized(): Promise<never> {
    await signOut({redirect: false});
    redirect("/login");
}
