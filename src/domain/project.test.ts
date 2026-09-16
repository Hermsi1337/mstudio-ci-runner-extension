import type { MittwaldAPIV2Client } from "@mittwald/api-client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getProjectCapabilities } from "@/domain/project.ts";

const loggerEnv = {
    POSTGRES_USER: "u",
    POSTGRES_PASSWORD: "p",
    POSTGRES_DB: "d",
    POSTGRES_HOST: "h",
    POSTGRES_PORT: "5432",
    EXTENSION_ID: "e",
    EXTENSION_SECRET: "s",
    ENCRYPTION_MASTER_PASSWORD: "m",
    ENCRYPTION_SALT: "salt",
};

function clientReturning(response: {
    status: number;
    data?: { supportedFeatures: string[] };
}): MittwaldAPIV2Client {
    return {
        project: {
            getProject: async () => response,
        },
    } as unknown as MittwaldAPIV2Client;
}

describe("getProjectCapabilities", () => {
    beforeAll(() => {
        for (const [key, value] of Object.entries(loggerEnv)) {
            vi.stubEnv(key, value);
        }
    });

    it("reports container hosting when the project supports the container feature", async () => {
        const capabilities = await getProjectCapabilities(
            clientReturning({
                status: 200,
                data: { supportedFeatures: ["redis", "container"] },
            }),
            "project-id",
        );

        expect(capabilities).toEqual({ containerHosting: true });
    });

    it("reports no container hosting for a project without the feature", async () => {
        const capabilities = await getProjectCapabilities(
            clientReturning({
                status: 200,
                data: { supportedFeatures: ["redis", "node"] },
            }),
            "project-id",
        );

        expect(capabilities).toEqual({ containerHosting: false });
    });

    it("fails with an upstream error when the project cannot be read", async () => {
        await expect(
            getProjectCapabilities(clientReturning({ status: 403 }), "p"),
        ).rejects.toMatchObject({ messageKey: "error.upstream.projectGet" });
    });
});
