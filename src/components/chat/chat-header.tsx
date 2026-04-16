"use client";

import {useSession, signOut} from "next-auth/react";
import {LogOut, User} from "lucide-react";
import {OrchidIcon} from "@/components/icons/orchid-icon";
import {MCPAuthStatus} from "./mcp-auth-status";

/**
 * Chat page header — logo, MCP auth status, user info, sign-out.
 */
export function ChatHeader() {
    const {data: session} = useSession();

    return (
        <header className="flex items-center justify-between border-b border-orchid-border bg-orchid-surface/50 px-4 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orchid-accent/15">
                    <OrchidIcon size={22} className="text-orchid-accent-glow" />
                </div>
                <h1 className="text-sm font-bold text-orchid-text">Orchid</h1>
            </div>

            <div className="flex items-center gap-3">
                <MCPAuthStatus />
                {session?.user?.name && (
                    <div className="flex items-center gap-2 text-sm text-orchid-muted">
                        <User className="h-4 w-4 text-orchid-muted" />
                        <span className="hidden sm:inline">{session.user.name}</span>
                    </div>
                )}
                <button
                    onClick={() => signOut({callbackUrl: "/login"})}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-orchid-muted transition-colors hover:bg-orchid-card hover:text-orchid-text"
                >
                    <LogOut className="h-3.5 w-3.5 text-orchid-muted" />
                    <span className="hidden sm:inline">Sign out</span>
                </button>
            </div>
        </header>
    );
}
