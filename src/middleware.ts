/**
 * Auth middleware — protect /chat routes.
 * Unauthenticated users are redirected to /login.
 */
import {auth} from "@/lib/auth/auth";
import {NextResponse} from "next/server";

export default auth((req) => {
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

export const config = {
    matcher: ["/chat/:path*", "/chat"],
};
