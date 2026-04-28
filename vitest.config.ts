import {defineConfig} from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "jsdom",
        globals: true,
        passWithNoTests: false,
        setupFiles: ["./vitest.setup.ts"],
        include: [
            "src/**/__spec__/**/*.spec.{ts,tsx}",
            "src/**/*.spec.{ts,tsx}",
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "text-summary", "html", "cobertura"],
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/**/__spec__/**",
                "src/**/*.spec.{ts,tsx}",
                "src/**/*.test.{ts,tsx}",
                "src/**/*.d.ts",
                "src/app/api/**",
                "src/app/layout.tsx",
                "src/app/page.tsx",
                "src/app/chat/page.tsx",
                "src/app/login/page.tsx",
                "src/proxy.ts",
                "src/lib/auth/auth.ts",
                "src/lib/auth/oauth-provider.ts",
            ],
            thresholds: {
                lines: 70,
                functions: 70,
                branches: 70,
                statements: 70,
            },
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
        },
    },
});
