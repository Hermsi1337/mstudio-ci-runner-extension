import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { localHostComponents } from "./local-host-plugin.ts";

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
        localHostComponents(),
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
