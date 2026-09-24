import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    GenericContainer,
    Network,
    type StartedNetwork,
    type StartedTestContainer,
    Wait,
} from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import builderVersions from "../../docker/builder/versions.json";
import runnerVersions from "../../docker/runner/versions.json";

/**
 * The runner has no Docker daemon: `docker build` in a pipeline goes to the
 * builder service of the same stack through a shared directory, and the runner
 * pushes the resulting tarball with crane. This test runs that path with a
 * registry of its own, a builder container and a runner container.
 *
 * kaniko destroys the root filesystem of the builder while it works, so a
 * builder container serves exactly one build. On Container Hosting the platform
 * replaces it because the service runs with restartPolicy "always", here every
 * test starts its own.
 */
const registryAlias = "registry";
const registryPort = 5000;
const registryHost = `${registryAlias}:${registryPort}`;
const builderTag = "mstudio-ci-builder:test";
const runnerTag = "mstudio-ci-runner-github:test";

let network: StartedNetwork;
let registry: StartedTestContainer;
let queueDirectory: string;

/**
 * Containers on Container Hosting run without CAP_SETFCAP, and the API has no
 * field to add it. Dropping it here keeps the builder as restricted as there.
 */
async function startBuilder(): Promise<StartedTestContainer> {
    return new GenericContainer(builderTag)
        .withNetwork(network)
        .withDroppedCapabilities("SETFCAP")
        .withBindMounts([{ source: queueDirectory, target: "/builds" }])
        .withWaitStrategy(Wait.forLogMessage(/watching/))
        .start();
}

async function startRunner(): Promise<StartedTestContainer> {
    return new GenericContainer(runnerTag)
        .withNetwork(network)
        .withEntrypoint(["sleep", "infinity"])
        .withEnvironment({ MSTUDIO_INSECURE_REGISTRIES: registryHost })
        .withBindMounts([{ source: queueDirectory, target: "/builds" }])
        .start();
}

async function writeContext(
    runner: StartedTestContainer,
    dockerfile: string,
): Promise<void> {
    const written = await runner.exec([
        "bash",
        "-c",
        `mkdir -p /home/runner/app && cat > /home/runner/app/Dockerfile <<'DOCKERFILE'\n${dockerfile}\nDOCKERFILE`,
    ]);
    expect(written.exitCode).toBe(0);
}

beforeAll(async () => {
    await GenericContainer.fromDockerfile("docker/builder")
        .withBuildkit()
        .withBuildArgs({
            GO_VERSION: builderVersions.kaniko.go,
            KANIKO_VERSION: builderVersions.kaniko.version,
            KANIKO_REPOSITORY: builderVersions.kaniko.repository,
        })
        .build(builderTag, { deleteOnExit: false });
    await GenericContainer.fromDockerfile("docker/runner", "github/Dockerfile")
        .withBuildArgs({
            RUNNER_VERSION: runnerVersions.github.version,
            RUNNER_SHA256_AMD64: runnerVersions.github.sha256.amd64,
            RUNNER_SHA256_ARM64: runnerVersions.github.sha256.arm64,
            CRANE_VERSION: runnerVersions.crane.version,
            CRANE_SHA256_AMD64: runnerVersions.crane.sha256.amd64,
            CRANE_SHA256_ARM64: runnerVersions.crane.sha256.arm64,
        })
        .build(runnerTag, { deleteOnExit: false });

    network = await new Network().start();
    registry = await new GenericContainer("registry:2")
        .withNetwork(network)
        .withNetworkAliases(registryAlias)
        .withExposedPorts(registryPort)
        .start();
    queueDirectory = await mkdtemp(join(tmpdir(), "mstudio-builds-"));
}, 900_000);

afterAll(async () => {
    await registry?.stop();
    await network?.stop();
    if (queueDirectory) {
        await rm(queueDirectory, { recursive: true, force: true });
    }
});

describe("image builds", () => {
    it("builds and pushes an image through docker build", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM alpine:3.20\nARG GREETING=hi\nRUN echo $GREETING > /greeting",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                [
                    "cd /home/runner/app &&",
                    `docker build --push -t ${registryHost}/app:1`,
                    "--build-arg GREETING=moin --label probe=yes",
                    "--iidfile /tmp/iid --metadata-file /tmp/metadata.json .",
                ].join(" "),
            ]);
            expect(build.output).toContain("handled by the mittwald builder");
            expect(build.exitCode).toBe(0);

            const imageId = await runner.exec(["cat", "/tmp/iid"]);
            const pushed = await runner.exec([
                "crane",
                "digest",
                `${registryHost}/app:1`,
                "--insecure",
            ]);
            expect(imageId.output.trim()).toBe(pushed.output.trim());

            const metadata = await runner.exec(["cat", "/tmp/metadata.json"]);
            expect(JSON.parse(metadata.output)).toMatchObject({
                "containerimage.digest": pushed.output.trim(),
                "image.name": `${registryHost}/app:1`,
            });

            const images = await runner.exec(["docker", "images"]);
            expect(images.output).toContain(`${registryHost}/app:1`);

            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("builds on a base image with file capabilities and warns", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM caddy:2.11-alpine\nRUN echo ok > /probe",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t caps:local . 2>&1",
            ]);
            expect(build.exitCode).toBe(0);
            expect(build.output).toContain(
                'could not restore "security.capability" on "/usr/bin/caddy"',
            );
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("reports a failing build with its exit code", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(runner, "FROM alpine:3.20\nRUN exit 7");
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t broken:local . 2>&1",
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain("exit 7");
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("fails a job left claimed by a builder that did not finish", async () => {
        const jobDirectory = join(queueDirectory, "queue", "build-orphan-test");
        await mkdir(jobDirectory, { recursive: true });
        await writeFile(
            join(jobDirectory, "request.claimed"),
            "DOCKERFILE=Dockerfile\nDESTINATION=orphan:1\n",
        );
        await writeFile(join(jobDirectory, "log"), "[kaniko] building...\n");
        const builder = await startBuilder();
        try {
            const result = await readFile(join(jobDirectory, "result"), "utf8");
            expect(result.trim()).toMatch(/^exit=[1-9][0-9]*$/);

            const log = await readFile(join(jobDirectory, "log"), "utf8");
            expect(log).toContain("replaced before the build finished");
        } finally {
            await builder.stop();
            await rm(jobDirectory, { recursive: true, force: true });
        }
    }, 300_000);

    it("refuses BuildKit only features before it queues a job", async () => {
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM alpine:3.20\nRUN --mount=type=cache,target=/tmp/cache true",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t broken:local . 2>&1",
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain("--mount is not supported");
        } finally {
            await runner.stop();
        }
    }, 300_000);
});
