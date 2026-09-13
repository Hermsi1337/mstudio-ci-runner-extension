import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

const port = Number(process.env.PORT ?? 3000);

const config = defineConfig({
    server: {
        allowedHosts: true,
        port,
    },
    plugins: [
        tsConfigPaths({
            projects: ["./tsconfig.json"],
        }),
        tanstackStart(),
        nitro({
            preset: "node-server",
            externals: {
                exportConditions: ["node", "import", "module", "default"],
            },
            scanDirs: ["src/server"],
        }),
        react(),
    ],
});

export default config;
