import type {Metadata, Viewport} from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Orchid — AI Assistant",
    description:
        "Orchid — multi-agent AI assistant",
    icons: {
        icon: "/icon.svg",
    },
};

export const viewport: Viewport = {
    themeColor: "#0D0B11",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
        <body className="antialiased bg-orchid-bg text-orchid-text">{children}</body>
        </html>
    );
}
