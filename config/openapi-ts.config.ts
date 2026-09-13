import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig([
    {
        input: "./openapi/extension-api.yaml",
        output: { path: "src/generated/extension-api", clean: true },
        plugins: [
            { name: "@hey-api/typescript", enums: "javascript" },
            {
                name: "zod",
                compatibilityVersion: 4,
                definitions: true,
                requests: false,
                responses: false,
            },
        ],
    },
    {
        input: "./openapi/upstream/gitlab.json",
        output: { path: "src/generated/gitlab", clean: true },
        plugins: [
            "@hey-api/typescript",
            "@hey-api/client-fetch",
            { name: "@hey-api/sdk", client: true },
        ],
    },
]);
