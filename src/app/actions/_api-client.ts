"use server";

/**
 * Shared API client utilities for all server actions.
 *
 * Centralizes the API base URL, auth header construction, and
 * unauthorized session handling.  All action files import from here
 * instead of duplicating these helpers.
 */

import {auth, signOut} from "@/lib/auth/auth";
import {redirect} from "next/navigation";

export const AGENTS_API_URL =
    process.env.AGENTS_API_URL ?? "http://localhost:8000";

/**
 * Build request headers with the NextAuth JWT bearer token.
 *
 * The access token is read from the server-side session and never
 * reaches the browser.
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
