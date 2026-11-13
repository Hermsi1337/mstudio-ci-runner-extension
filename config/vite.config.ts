import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const port = Number(process.env.PORT ?? 3000);

const config = defineConfig({
    server: {
        allowedHosts: true,
        port,
    },
    resolve: {
        tsconfigPaths: true,
    },
    plugins: [
        tanstackStart(),
        nitro({
            preset: "node-server",
            scanDirs: ["src/server"],
        }),
        react(),
    ],
});

export default config;
