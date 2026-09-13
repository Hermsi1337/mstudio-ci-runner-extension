import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [tsConfigPaths({ projects: ["./tsconfig.json"] })],
    test: {
        fileParallelism: false,
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    include: ["src/**/*.test.ts", "config/**/*.test.ts"],
                    environment: "node",
                },
            },
            {
                extends: true,
                test: {
                    name: "integration",
                    include: ["tests/integration/**/*.test.ts"],
                    environment: "node",
                    testTimeout: 180_000,
                    hookTimeout: 300_000,
                },
            },
        ],
    },
});
