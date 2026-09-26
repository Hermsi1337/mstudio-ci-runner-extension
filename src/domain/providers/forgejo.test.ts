import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ProviderRequest } from "./types.ts";

const requiredEnv = {
    POSTGRES_USER: "u",
    POSTGRES_PASSWORD: "p",
    POSTGRES_DB: "d",
    POSTGRES_HOST: "h",
    POSTGRES_PORT: "5432",
    EXTENSION_ID: "e",
    EXTENSION_SECRET: "s",
    ENCRYPTION_MASTER_PASSWORD: "m",
    ENCRYPTION_SALT: "salt",
    RUNNER_IMAGE_FORGEJO: "ghcr.io/hermsi1337/mstudio-ci-runner-forgejo:test",
};

const request: ProviderRequest<"forgejo"> = {
    provider: "forgejo",
    name: "Forgejo Runner",
    instanceUrl: "https://forgejo.example.com/",
    tokenType: "registration",
    uuid: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
    token: "6634bb58be0db23cc013a2e72dd1828ae0257cf",
    labels: "mittwald,node",
};

describe("forgejo provider", () => {
    beforeAll(() => {
        for (const [key, value] of Object.entries(requiredEnv)) {
            vi.stubEnv(key, value);
        }
    });

    it("passes URL, UUID, token and labels to the container", async () => {
        const { forgejoProvider } = await import("./forgejo.ts");
        const prepared = await forgejoProvider.prepare(
            request,
            "forgejo-runner",
        );

        expect(prepared).toEqual({
            target: "forgejo.example.com",
            targetUrl: "https://forgejo.example.com",
            image: "ghcr.io/hermsi1337/mstudio-ci-runner-forgejo:test",
            runnerVersion: forgejoProvider.runnerVersion,
            environment: {
                FORGEJO_INSTANCE_URL: "https://forgejo.example.com",
                FORGEJO_RUNNER_UUID: request.uuid,
                FORGEJO_RUNNER_TOKEN: request.token,
                RUNNER_NAME: "forgejo-runner",
                RUNNER_LABELS: "mittwald,node",
            },
            volumes: ["data:/home/runner/data"],
            labels: "mittwald,node",
            ephemeral: false,
        });
        expect(forgejoProvider.concurrencyVariable).toBe("RUNNER_CAPACITY");
    });

    it("falls back to the label mittwald", async () => {
        const { forgejoProvider } = await import("./forgejo.ts");
        const prepared = await forgejoProvider.prepare(
            { ...request, labels: "" },
            "forgejo-runner",
        );

        expect(prepared.labels).toBe("mittwald");
        expect(prepared.environment.RUNNER_LABELS).toBe("mittwald");
    });

    it("keeps a path below the instance root", async () => {
        const { normalizeForgejoUrl } = await import("./forgejo.ts");

        expect(normalizeForgejoUrl(" https://example.com/forgejo/ ")).toBe(
            "https://example.com/forgejo",
        );
    });

    it.each([
        "http://forgejo.example.com",
        "forgejo.example.com",
        "https://user:secret@forgejo.example.com",
        "https://forgejo.example.com/?a=b",
        "https://forgejo.example.com/#top",
        "ssh://forgejo.example.com",
    ])("rejects %s", async (url) => {
        const { normalizeForgejoUrl } = await import("./forgejo.ts");

        expect(() => normalizeForgejoUrl(url)).toThrow(
            expect.objectContaining({
                messageKey: "error.forgejo.instanceUrlInvalid",
            }),
        );
    });

    it("releases nothing, the runner stays in Forgejo", async () => {
        const { forgejoProvider } = await import("./forgejo.ts");

        await expect(
            forgejoProvider.release({
                FORGEJO_INSTANCE_URL: "https://forgejo.example.com",
                FORGEJO_RUNNER_TOKEN: "6634bb58be0db23cc013a2e72dd1828ae0257cf",
            }),
        ).resolves.toBeUndefined();
    });
});
