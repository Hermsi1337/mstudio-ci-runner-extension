import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it } from "vitest";

/**
 * Registration itself is expected to fail because the CI server URLs point to
 * unreachable hosts; the tests only verify that the entrypoint gets that far.
 */
interface ImageCase {
    provider: string;
    environment: Record<string, string>;
    waitFor: RegExp;
    expectLog: string;
    versionCommand: string[];
}

const images: ImageCase[] = [
    {
        provider: "github",
        environment: {
            GITHUB_URL: "https://github.com/acme/app",
            RUNNER_TOKEN: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            RUNNER_NAME: "integration-test",
            RUNNER_LABELS: "mittwald,test",
            RUNNER_EPHEMERAL: "false",
        },
        waitFor: /Self-hosted runner registration/,
        expectLog:
            "registering integration-test at https://github.com/acme/app (labels: mittwald,test, ephemeral: false)",
        versionCommand: ["cat", "/home/runner/bin/Runner.Listener.deps.json"],
    },
    {
        provider: "gitlab",
        environment: {
            CI_SERVER_URL: "https://gitlab.invalid",
            CI_SERVER_TOKEN: "glrt-AAAAAAAAAAAAAAAAAAAA",
            RUNNER_NAME: "integration-test",
        },
        waitFor:
            /Runtime platform|ERROR: Verifying runner|couldn't execute POST/,
        expectLog:
            "registering integration-test at https://gitlab.invalid (executor: shell)",
        versionCommand: ["gitlab-runner", "--version"],
    },
];

describe.each(images)("runner image: $provider", (image) => {
    const tag = `mstudio-ci-runner-${image.provider}:test`;

    it("builds and starts the registration flow", async () => {
        const built = await GenericContainer.fromDockerfile(
            `docker/runner/${image.provider}`,
        ).build(tag, { deleteOnExit: false });

        const logs: string[] = [];
        const container = await built
            .withEnvironment(image.environment)
            .withLogConsumer((stream) => {
                stream.on("data", (line: string) => logs.push(line));
            })
            .withWaitStrategy(Wait.forLogMessage(image.waitFor))
            .withStartupTimeout(120_000)
            .start();

        try {
            expect(logs.join("")).toContain(image.expectLog);
        } finally {
            await container.stop({ timeout: 5_000 });
        }
    });

    it("runs as the unprivileged runner user", async () => {
        const container = await new GenericContainer(tag)
            .withEntrypoint(["sleep", "infinity"])
            .start();
        try {
            const whoami = await container.exec(["id", "-un"]);
            expect(whoami.output.trim()).toBe("runner");
            const version = await container.exec(image.versionCommand);
            expect(version.exitCode).toBe(0);
        } finally {
            await container.stop();
        }
    });
});
