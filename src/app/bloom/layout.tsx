"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import type {ReactNode} from "react";

import {Activity, Bell, CalendarClock, Workflow} from "lucide-react";

/**
 * Bloom panel shell — header + left rail nav (§F6 a11y polish).
 *
 * The four nav entries mirror the four backend surfaces: Runs
 * (default landing), Signals, Triggers, Schedules.  The active
 * entry is marked with ``aria-current="page"`` so screen readers
 * announce it; focus rings render via ``focus-visible:`` so
 * keyboard users always see where they are.
 *
 * The Bloom panel runs alongside ``/chat`` — the header carries a
 * single "Back to chat" link rather than a global nav.
 */
export default function BloomLayout({children}: {children: ReactNode}) {
    return (
        <div className="min-h-screen bg-orchid-surface text-orchid-dark">
            <a
                href="#bloom-main"
                className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-white focus:text-orchid-accent focus:px-3 focus:py-1 focus:rounded-md focus:shadow"
            >
                Skip to main content
            </a>
            <header className="border-b border-orchid-border bg-white">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <Activity
                            className="w-5 h-5 text-orchid-accent"
                            aria-hidden="true"
                        />
                        Bloom
                    </h1>
                    <Link
                        href="/chat"
                        className="text-sm text-orchid-dark hover:text-orchid-accent focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 rounded"
                    >
                        Back to chat
                    </Link>
                </div>
            </header>
            <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
                <nav aria-label="Bloom sections" className="space-y-1">
                    <NavLink
                        href="/bloom"
                        label="Runs"
                        icon={<Activity className="w-4 h-4" aria-hidden="true" />}
                    />
                    <NavLink
                        href="/bloom/signals"
                        label="Signals"
                        icon={<Bell className="w-4 h-4" aria-hidden="true" />}
                    />
                    <NavLink
                        href="/bloom/triggers"
                        label="Triggers"
                        icon={<Workflow className="w-4 h-4" aria-hidden="true" />}
                    />
                    <NavLink
                        href="/bloom/schedules"
                        label="Schedules"
                        icon={
                            <CalendarClock className="w-4 h-4" aria-hidden="true" />
                        }
                    />
                </nav>
                <main id="bloom-main">{children}</main>
            </div>
        </div>
    );
}

function NavLink({
    href,
    label,
    icon,
}: {
    href: string;
    label: string;
    icon: ReactNode;
}) {
    const pathname = usePathname() ?? "";
    // Exact match for ``/bloom`` so the runs landing doesn't claim
    // the highlight on every nested route; prefix match for the
    // other three sections so deep links (e.g. ``/bloom/runs/{id}``
    // → highlight Runs) still light up.
    const isActive =
        href === "/bloom"
            ? pathname === "/bloom" || pathname.startsWith("/bloom/runs")
            : pathname.startsWith(href);
    return (
        <Link
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors focus-visible:outline-2 focus-visible:outline-orchid-accent focus-visible:outline-offset-2 ${
                isActive
                    ? "bg-white text-orchid-accent font-medium"
                    : "text-orchid-dark hover:bg-white hover:text-orchid-accent"
            }`}
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}
