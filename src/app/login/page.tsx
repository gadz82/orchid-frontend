"use client";

import {useState} from "react";
import {signIn} from "next-auth/react";
import {OrchidIcon} from "@/components/icons/orchid-icon";

const isDevBypass = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

/**
 * Login page — initiates the OAuth flow with the configured provider.
 *
 * In production: redirects to the OAuth provider's authorization page.
 * In dev mode (DEV_AUTH_BYPASS=true): shows a one-click dev login button.
 */
export default function LoginPage() {
    const [loading, setLoading] = useState(false);

    const handleDevLogin = async () => {
        setLoading(true);
        await signIn("dev", {callbackUrl: "/chat"});
    };

    const handleOAuthLogin = async () => {
        setLoading(true);
        try {
            await signIn("oauth", {callbackUrl: "/chat"});
        } catch {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-orchid-bg">
            <div className="w-full max-w-md space-y-8 rounded-2xl bg-orchid-card p-8 shadow-card border border-orchid-border">
                {/* Logo / header */}
                <div className="text-center">
                    <div
                        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orchid-accent/15 shadow-glow">
                        <OrchidIcon size={36} className="text-orchid-accent-glow"/>
                    </div>
                    <h1 className="text-2xl font-bold text-orchid-text">Orchid</h1>
                    <p className="mt-2 text-sm text-orchid-muted">
                        {isDevBypass
                            ? "Demo mode — click below to enter"
                            : "Sign in to get started"}
                    </p>
                </div>

                {isDevBypass ? (
                    /* Dev bypass — one-click login */
                    <button
                        onClick={handleDevLogin}
                        disabled={loading}
                        className="w-full rounded-lg bg-orchid-accent px-4 py-2.5 text-sm font-semibold
                       text-white transition-all hover:bg-orchid-accent-hover hover:shadow-glow
                       disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Connecting..." : "Enter Demo"}
                    </button>
                ) : (
                    /* Production — OAuth login */
                    <button
                        onClick={handleOAuthLogin}
                        disabled={loading}
                        className="w-full rounded-lg bg-orchid-accent px-4 py-2.5 text-sm font-semibold
                       text-white transition-all hover:bg-orchid-accent-hover hover:shadow-glow
                       disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? "Connecting..." : "Sign in"}
                    </button>
                )}
            </div>
        </div>
    );
}
