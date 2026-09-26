import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    GenericContainer,
    getContainerRuntimeClient,
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
const authRegistryAlias = "private-registry";
const authRegistryHost = `${authRegistryAlias}:${registryPort}`;
// bcrypt of "ci-password", made with `htpasswd -Bbn ci ci-password`.
const authRegistryUsers =
    "ci:$2y$05$BFXZmLpWq7cgAl/.I3CEb.YQlM.ituQPAE8dEb9idS24fEAGb5l/S\n";
const builderTag = "mstudio-ci-builder:test";
const runnerTag = "mstudio-ci-runner-github:test";

const native = process.arch === "arm64" ? "arm64" : "amd64";
const foreign = native === "arm64" ? "amd64" : "arm64";
const elfMachine: Record<string, string> = { amd64: "3e00", arm64: "b700" };
const unameMachine: Record<string, string> = {
    amd64: "x86_64",
    arm64: "aarch64",
};

let network: StartedNetwork;
let registry: StartedTestContainer;
let authRegistry: StartedTestContainer;
let queueDirectory: string;

type BuilderOptions = {
    /** Docker's default seccomp profile, which blocks unshare and so emulation. */
    seccomp?: boolean;
};

/**
 * Containers on Container Hosting run as root with CHOWN, DAC_OVERRIDE, FOWNER,
 * FSETID, KILL, SETGID, SETUID, SETPCAP and NET_BIND_SERVICE, without a seccomp
 * filter and without AppArmor confinement. The builder gets the same here.
 * Docker's default seccomp profile would block the user namespace that runs
 * emulated RUN steps, so only the fallback test keeps it.
 */
async function startBuilder(
    options: BuilderOptions = {},
): Promise<StartedTestContainer> {
    const container = new GenericContainer(builderTag)
        .withNetwork(network)
        .withDroppedCapabilities(
            "SETFCAP",
            "MKNOD",
            "NET_RAW",
            "SYS_CHROOT",
            "AUDIT_WRITE",
        )
        .withBindMounts([{ source: queueDirectory, target: "/builds" }])
        .withWaitStrategy(Wait.forLogMessage(/watching/));
    if (!options.seccomp) {
        container.withSecurityOpt("seccomp=unconfined", "apparmor=unconfined");
    }
    return container.start();
}

/**
 * A builder serves one build and exits, and a build for several platforms is
 * one job per platform. Container Hosting restarts the service with a clean
 * root filesystem, here a new container takes over once the last one exited.
 */
async function superviseBuilders(
    options: BuilderOptions = {},
): Promise<() => Promise<void>> {
    const client = await getContainerRuntimeClient();
    let running = true;
    let current = await startBuilder(options);
    const loop = (async () => {
        while (running) {
            const info = await client.container.inspect(
                client.container.getById(current.getId()),
            );
            if (!info.State.Running) {
                await current.stop();
                if (running) {
                    current = await startBuilder(options);
                }
                continue;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    })();
    return async () => {
        running = false;
        await loop;
        await current.stop();
    };
}

async function startRunner(): Promise<StartedTestContainer> {
    return new GenericContainer(runnerTag)
        .withNetwork(network)
        .withEntrypoint(["sleep", "infinity"])
        .withEnvironment({
            MSTUDIO_INSECURE_REGISTRIES: `${registryHost},${authRegistryHost}`,
        })
        .withBindMounts([{ source: queueDirectory, target: "/builds" }])
        .start();
}

async function builderEnvironment(): Promise<Record<string, string>> {
    const content = await readFile(join(queueDirectory, "builder.env"), "utf8");
    return Object.fromEntries(
        content
            .trim()
            .split("\n")
            .map((line) => line.split("=", 2) as [string, string]),
    );
}

/** Architecture in the image config of one platform of a reference. */
async function configArchitecture(
    runner: StartedTestContainer,
    reference: string,
    platform?: string,
): Promise<string> {
    const config = await runner.exec([
        "bash",
        "-c",
        `crane config --insecure ${platform ? `--platform ${platform} ` : ""}${reference} | jq -r .architecture`,
    ]);
    expect(config.exitCode).toBe(0);
    return config.output.trim();
}

/** Bytes 18 and 19 of an ELF file in an image: the machine it runs on. */
async function fileMachine(
    runner: StartedTestContainer,
    reference: string,
    path: string,
    platform?: string,
): Promise<string> {
    const machine = await runner.exec([
        "bash",
        "-c",
        `crane export --insecure ${platform ? `--platform ${platform} ` : ""}${reference} - | tar -xO ${path} | od -An -tx1 -j18 -N2 | tr -d ' \\n'`,
    ]);
    expect(machine.exitCode).toBe(0);
    return machine.output.trim();
}

async function readFromImage(
    runner: StartedTestContainer,
    reference: string,
    path: string,
    platform?: string,
): Promise<string> {
    const content = await runner.exec([
        "bash",
        "-c",
        `crane export --insecure ${platform ? `--platform ${platform} ` : ""}${reference} - | tar -xO ${path}`,
    ]);
    expect(content.exitCode).toBe(0);
    return content.output.trim();
}

const goProgram = [
    "package main",
    "",
    'import "fmt"',
    'import "runtime"',
    "",
    'func main() { fmt.Println("hello from", runtime.GOARCH) }',
].join("\n");

async function writeContextFile(
    runner: StartedTestContainer,
    name: string,
    content: string,
): Promise<void> {
    const written = await runner.exec([
        "bash",
        "-c",
        `mkdir -p /home/runner/app && cat > /home/runner/app/${name} <<'CONTENT'\n${content}\nCONTENT`,
    ]);
    expect(written.exitCode).toBe(0);
}

async function writeContext(
    runner: StartedTestContainer,
    dockerfile: string,
): Promise<void> {
    await writeContextFile(runner, "Dockerfile", dockerfile);
}

beforeAll(async () => {
    await GenericContainer.fromDockerfile("docker/builder")
        .withBuildkit()
        .withBuildArgs({
            GO_VERSION: builderVersions.kaniko.go,
            KANIKO_VERSION: builderVersions.kaniko.version,
            KANIKO_REPOSITORY: builderVersions.kaniko.repository,
            QEMU_VERSION: builderVersions.qemu.version,
            QEMU_SNAPSHOT: builderVersions.qemu.snapshot,
            QEMU_SHA256_AMD64: builderVersions.qemu.sha256.amd64,
            QEMU_SHA256_ARM64: builderVersions.qemu.sha256.arm64,
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
    authRegistry = await new GenericContainer("registry:2")
        .withNetwork(network)
        .withNetworkAliases(authRegistryAlias)
        .withEnvironment({
            REGISTRY_AUTH: "htpasswd",
            REGISTRY_AUTH_HTPASSWD_REALM: "ci",
            REGISTRY_AUTH_HTPASSWD_PATH: "/auth/htpasswd",
        })
        .withCopyContentToContainer([
            { content: authRegistryUsers, target: "/auth/htpasswd" },
        ])
        .withExposedPorts(registryPort)
        .start();
    queueDirectory = await mkdtemp(join(tmpdir(), "mstudio-builds-"));
    // mkdtemp creates the directory with mode 0700 for the host user. The runner
    // runs as uid 1001, which only matches the host user on GitHub Actions.
    await chmod(queueDirectory, 0o777);
}, 900_000);

afterAll(async () => {
    await registry?.stop();
    await authRegistry?.stop();
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

    it("defines the platform arguments BuildKit predefines", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                [
                    "FROM --platform=$BUILDPLATFORM alpine:3.20",
                    "ARG BUILDPLATFORM",
                    "ARG TARGETPLATFORM",
                    "ARG TARGETOS",
                    "ARG TARGETARCH",
                    'RUN echo "platform-args $BUILDPLATFORM $TARGETPLATFORM $TARGETOS $TARGETARCH"',
                ].join("\n"),
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t args:local . 2>&1",
            ]);
            expect(build.exitCode).toBe(0);
            expect(build.output).toContain(
                `platform-args linux/${native} linux/${native} linux ${native}`,
            );
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

    it("installs a package with an Alpine conffile on a Debian base image", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                [
                    "FROM python:3.12-slim-bookworm",
                    "RUN apt-get update && apt-get install -y --no-install-recommends procps",
                ].join("\n"),
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t conffile:local . 2>&1",
            ]);
            expect(build.output).not.toContain("conffile prompt");
            expect(build.exitCode).toBe(0);
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

    it("refuses an architecture without emulator in FROM before it queues a job", async () => {
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM --platform=linux/s390x alpine:3.20\nRUN true",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t foreign:local . 2>&1",
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain(
                "FROM --platform=linux/s390x: platform linux/s390x is not supported",
            );
            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
        }
    }, 300_000);

    it("builds for the other architecture without emulation", async () => {
        const stopBuilders = await superviseBuilders({ seccomp: true });
        const runner = await startRunner();
        try {
            const builder = await builderEnvironment();
            // A host that registered qemu itself, like the arm64 CI runner for
            // the Prism mock, still runs foreign binaries.
            expect(builder.EMULATION).not.toBe("namespace");

            await writeContextFile(runner, "hello.txt", "hello");
            await writeContext(
                runner,
                "FROM alpine:3.20\nCOPY hello.txt /hello.txt",
            );
            const copyOnly = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${foreign} --push -t ${registryHost}/copy-only:1 . 2>&1`,
            ]);
            expect(copyOnly.exitCode).toBe(0);
            const copyOnlyImage = `${registryHost}/copy-only:1`;
            expect(await configArchitecture(runner, copyOnlyImage)).toBe(
                foreign,
            );
            expect(
                await fileMachine(runner, copyOnlyImage, "bin/busybox"),
            ).toBe(elfMachine[foreign]);

            await writeContextFile(runner, "main.go", goProgram);
            await writeContext(
                runner,
                [
                    "FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build",
                    "ARG TARGETARCH",
                    "WORKDIR /src",
                    "COPY main.go .",
                    "RUN CGO_ENABLED=0 GOARCH=$TARGETARCH go build -o /hello main.go",
                    "FROM scratch",
                    "COPY --from=build /hello /hello",
                ].join("\n"),
            );
            const cross = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${foreign} --push -t ${registryHost}/cross:1 . 2>&1`,
            ]);
            expect(cross.exitCode).toBe(0);
            const crossImage = `${registryHost}/cross:1`;
            expect(await configArchitecture(runner, crossImage)).toBe(foreign);
            expect(await fileMachine(runner, crossImage, "hello")).toBe(
                elfMachine[foreign],
            );

            await writeContext(runner, "FROM alpine:3.20\nRUN true");
            const run = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${foreign} -t run:local . 2>&1`,
            ]);
            if (builder.EMULATION === "none") {
                expect(run.exitCode).not.toBe(0);
                expect(run.output).toContain(
                    `the builder cannot run RUN steps for linux/${foreign}`,
                );
            } else {
                expect(run.exitCode).toBe(0);
            }

            const platforms = await runner.exec(["docker", "buildx", "ls"]);
            expect(platforms.output).toContain(
                builder.PLATFORMS.replaceAll(",", ", "),
            );
        } finally {
            await runner.stop();
            await stopBuilders();
        }
    }, 900_000);

    it("runs RUN steps for the other architecture under qemu", async () => {
        const stopBuilders = await superviseBuilders();
        const runner = await startRunner();
        try {
            expect(await builderEnvironment()).toMatchObject({
                EMULATION: "namespace",
                PLATFORMS: `linux/${native},linux/${foreign}`,
            });
            const inspect = await runner.exec(["docker", "buildx", "inspect"]);
            expect(inspect.output).toContain(
                `Platforms: linux/${native}, linux/${foreign}`,
            );

            await writeContext(
                runner,
                [
                    "FROM alpine:3.20",
                    "ARG TARGETARCH",
                    'RUN uname -m > /machine && echo "$TARGETARCH" > /targetarch && apk add --no-cache file',
                ].join("\n"),
            );
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${foreign} --push -t ${registryHost}/emulated:1 . 2>&1`,
            ]);
            expect(build.exitCode).toBe(0);
            const image = `${registryHost}/emulated:1`;
            expect(await configArchitecture(runner, image)).toBe(foreign);
            expect(await readFromImage(runner, image, "machine")).toBe(
                unameMachine[foreign],
            );
            expect(await readFromImage(runner, image, "targetarch")).toBe(
                foreign,
            );
            expect(await fileMachine(runner, image, "usr/bin/file")).toBe(
                elfMachine[foreign],
            );
        } finally {
            await runner.stop();
            await stopBuilders();
        }
    }, 900_000);

    it("builds a base image with file capabilities for the other architecture", async () => {
        const stopBuilders = await superviseBuilders();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM caddy:2.11-alpine\nRUN echo ok > /probe",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${foreign} -t caps-foreign:local . 2>&1`,
            ]);
            expect(build.exitCode).toBe(0);
        } finally {
            await runner.stop();
            await stopBuilders();
        }
    }, 900_000);

    it("pushes one index for two platforms to a registry that needs a login", async () => {
        const stopBuilders = await superviseBuilders();
        const runner = await startRunner();
        try {
            await writeContextFile(runner, "main.go", goProgram);
            await writeContext(
                runner,
                [
                    "FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build",
                    "ARG TARGETARCH",
                    "WORKDIR /src",
                    "COPY main.go .",
                    "RUN CGO_ENABLED=0 GOARCH=$TARGETARCH go build -o /hello main.go",
                    "FROM alpine:3.20",
                    "RUN uname -m > /machine",
                    "COPY --from=build /hello /hello",
                ].join("\n"),
            );
            const image = `${authRegistryHost}/multi:1`;
            const build = await runner.exec([
                "bash",
                "-c",
                [
                    "cd /home/runner/app &&",
                    `echo ci-password | docker login -u ci --password-stdin ${authRegistryHost} &&`,
                    "docker buildx build --platform linux/amd64,linux/arm64 --push",
                    `-t ${image} --iidfile /tmp/iid --metadata-file /tmp/metadata.json . 2>&1`,
                ].join(" "),
            ]);
            expect(build.exitCode).toBe(0);

            const manifest = await runner.exec([
                "crane",
                "manifest",
                "--insecure",
                image,
            ]);
            expect(manifest.exitCode).toBe(0);
            const index = JSON.parse(manifest.output) as {
                mediaType: string;
                manifests: { platform: { architecture: string } }[];
            };
            expect(index.mediaType).toBe(
                "application/vnd.oci.image.index.v1+json",
            );
            expect(
                index.manifests
                    .map((entry) => entry.platform.architecture)
                    .sort(),
            ).toEqual(["amd64", "arm64"]);

            const tags = await runner.exec([
                "crane",
                "ls",
                "--insecure",
                `${authRegistryHost}/multi`,
            ]);
            expect(tags.output.trim()).toBe("1");

            const digest = await runner.exec([
                "crane",
                "digest",
                "--insecure",
                image,
            ]);
            const imageId = await runner.exec(["cat", "/tmp/iid"]);
            expect(imageId.output.trim()).toBe(digest.output.trim());
            const metadata = await runner.exec(["cat", "/tmp/metadata.json"]);
            expect(JSON.parse(metadata.output)).toEqual({
                "containerimage.digest": digest.output.trim(),
                "image.name": image,
            });

            for (const architecture of ["amd64", "arm64"]) {
                const platform = `linux/${architecture}`;
                expect(await configArchitecture(runner, image, platform)).toBe(
                    architecture,
                );
                expect(
                    await readFromImage(runner, image, "machine", platform),
                ).toBe(unameMachine[architecture]);
                expect(
                    await fileMachine(runner, image, "hello", platform),
                ).toBe(elfMachine[architecture]);
            }

            const unauthenticated = await runner.exec([
                "bash",
                "-c",
                `DOCKER_CONFIG=$(mktemp -d) crane manifest --insecure ${image} 2>&1`,
            ]);
            expect(unauthenticated.exitCode).not.toBe(0);
            expect(unauthenticated.output).toContain("UNAUTHORIZED");
        } finally {
            await runner.stop();
            await stopBuilders();
        }
    }, 1_200_000);
});
