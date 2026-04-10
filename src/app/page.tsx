import {redirect} from "next/navigation";
import {auth} from "@/lib/auth/auth";

/**
 * Root page — redirect to /chat if authenticated, /login otherwise.
 */
export default async function Home() {
    const session = await auth();
    if (session) {
        redirect("/chat");
    } else {
        redirect("/login");
    }
}
