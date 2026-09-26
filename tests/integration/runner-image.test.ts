import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it } from "vitest";
import runnerVersions from "../../docker/runner/versions.json";

/**
 * Registration itself is expected to fail because the CI server URLs point to
 * unreachable hosts; the tests only verify that the entrypoint gets that far.
 */
interface MissingEnvCase {
    name: string;
    environment: Record<string, string>;
    message: string;
}

interface ImageCase {
    provider: "github" | "gitlab" | "forgejo";
    environment: Record<string, string>;
    waitFor: RegExp;
    expectLog: string;
    versionCommand: string[];
    dataDirectories: string[];
    missingEnv: MissingEnvCase[];
    probeEnvironment?: Record<string, string>;
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
        dataDirectories: ["config", "work"],
        missingEnv: [
            {
                name: "GITHUB_URL",
                environment: {},
                message: "GITHUB_URL is required",
            },
            {
                name: "RUNNER_TOKEN and GITHUB_TOKEN",
                environment: { GITHUB_URL: "https://github.com/acme/app" },
                message: "either RUNNER_TOKEN or GITHUB_TOKEN is required",
            },
        ],
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
        dataDirectories: ["builds", "cache"],
        missingEnv: [
            {
                name: "CI_SERVER_URL",
                environment: {},
                message: "CI_SERVER_URL is required",
            },
            {
                name: "CI_SERVER_TOKEN",
                environment: { CI_SERVER_URL: "https://gitlab.invalid" },
                message: "CI_SERVER_TOKEN is required",
            },
        ],
    },
    {
        provider: "forgejo",
        environment: {
            FORGEJO_INSTANCE_URL: "https://forgejo.invalid",
            FORGEJO_RUNNER_UUID: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
            FORGEJO_RUNNER_TOKEN: "6634bb58be0db23cc013a2e72dd1828ae0257cf",
            RUNNER_NAME: "integration-test",
            RUNNER_LABELS: "mittwald, node",
            RUNNER_CAPACITY: "2",
        },
        waitFor: /Starting runner daemon|fail to invoke Declare/,
        expectLog:
            "starting integration-test for https://forgejo.invalid (labels: mittwald:host,node:host, capacity: 2, executor: host)",
        versionCommand: ["forgejo-runner", "--version"],
        dataDirectories: ["work"],
        missingEnv: [
            {
                name: "FORGEJO_INSTANCE_URL",
                environment: {},
                message: "FORGEJO_INSTANCE_URL is required",
            },
            {
                name: "FORGEJO_RUNNER_UUID",
                environment: {
                    FORGEJO_INSTANCE_URL: "https://forgejo.invalid",
                },
                message: "FORGEJO_RUNNER_UUID is required",
            },
            {
                name: "FORGEJO_RUNNER_TOKEN",
                environment: {
                    FORGEJO_INSTANCE_URL: "https://forgejo.invalid",
                    FORGEJO_RUNNER_UUID: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
                },
                message: "FORGEJO_RUNNER_TOKEN is required",
            },
            {
                name: "a valid RUNNER_CAPACITY",
                environment: {
                    FORGEJO_INSTANCE_URL: "https://forgejo.invalid",
                    FORGEJO_RUNNER_UUID: "c9e50be9-a7c3-4aee-ba35-624c4ff8c519",
                    FORGEJO_RUNNER_TOKEN:
                        "6634bb58be0db23cc013a2e72dd1828ae0257cf",
                    RUNNER_CAPACITY: "0",
                },
                message: "RUNNER_CAPACITY must be a positive integer",
            },
        ],
        probeEnvironment: {
            EXPECTED_NODE_VERSION: runnerVersions.node.version,
        },
    },
];

describe.each(images)("runner image: $provider", (image) => {
    const tag = `mstudio-ci-runner-${image.provider}:test`;

    it("builds and starts the registration flow", async () => {
        const built = await GenericContainer.fromDockerfile(
            "docker/runner",
            `${image.provider}/Dockerfile`,
        )
            .withBuildArgs({
                RUNNER_VERSION: runnerVersions[image.provider].version,
                RUNNER_SHA256_AMD64:
                    runnerVersions[image.provider].sha256.amd64,
                RUNNER_SHA256_ARM64:
                    runnerVersions[image.provider].sha256.arm64,
                CRANE_VERSION: runnerVersions.crane.version,
                CRANE_SHA256_AMD64: runnerVersions.crane.sha256.amd64,
                CRANE_SHA256_ARM64: runnerVersions.crane.sha256.arm64,
                NODE_VERSION: runnerVersions.node.version,
                NODE_SHA256_AMD64: runnerVersions.node.sha256.amd64,
                NODE_SHA256_ARM64: runnerVersions.node.sha256.arm64,
            })
            .build(tag, { deleteOnExit: false });

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
            const data = await container.exec(["ls", "/home/runner/data"]);
            expect(data.output.trim().split(/\s+/)).toEqual(
                image.dataDirectories,
            );
            const trim = await container.exec([
                "bash",
                "-c",
                "mkdir -p /tmp/cache && dd if=/dev/zero of=/tmp/cache/old bs=1M count=2 status=none && sleep 1 && dd if=/dev/zero of=/tmp/cache/new bs=1M count=2 status=none && trim-cache.sh /tmp/cache 0 && ls /tmp/cache | wc -l",
            ]);
            expect(trim.exitCode).toBe(0);
            expect(trim.output.trim().split("\n").at(-1)).toBe("0");
        } finally {
            await container.stop();
        }
    });

    it("passes the probe suite", async () => {
        const container = await new GenericContainer(tag)
            .withEntrypoint(["sleep", "infinity"])
            .withCopyDirectoriesToContainer([
                { source: "docker/runner/probes", target: "/probes" },
            ])
            .start();
        try {
            const probe = await container.exec(
                ["bash", `/probes/${image.provider}.sh`],
                {
                    env: {
                        EXPECTED_RUNNER_VERSION:
                            runnerVersions[image.provider].version,
                        ...image.probeEnvironment,
                    },
                },
            );
            expect(probe.output).toContain("probes passed");
            expect(probe.exitCode).toBe(0);
        } finally {
            await container.stop();
        }
    }, 300_000);

    it.each(image.missingEnv)(
        "entrypoint fails without $name",
        async (missing) => {
            const container = await new GenericContainer(tag)
                .withEntrypoint(["sleep", "infinity"])
                .start();
            try {
                const assignments = Object.entries(missing.environment)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(" ");
                const run = await container.exec([
                    "bash",
                    "-c",
                    `env ${assignments} /entrypoint.sh 2>&1`,
                ]);
                expect(run.exitCode).not.toBe(0);
                expect(run.output).toContain(missing.message);
            } finally {
                await container.stop();
            }
        },
    );
});
