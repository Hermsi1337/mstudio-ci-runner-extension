import {
    chmod,
    copyFile,
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
    environment?: Record<string, string>;
};

/**
 * With emulation every job runs in the sandbox, without it on the root
 * filesystem of the builder. Tests of behavior that differs between the two
 * run once per path.
 */
const buildPaths = [
    { name: "in the sandbox", options: {} },
    { name: "without emulation", options: { seccomp: true } },
] satisfies { name: string; options: BuilderOptions }[];

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
        .withEnvironment(options.environment ?? {})
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
type Builders = {
    stop: () => Promise<void>;
    /** Kills the running builder, the way the platform replaces a container. */
    kill: () => Promise<void>;
};

async function superviseBuilders(
    options: BuilderOptions = {},
): Promise<Builders> {
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
    return {
        stop: async () => {
            running = false;
            await loop;
            await current.stop();
        },
        kill: async () => {
            await client.container.getById(current.getId()).kill();
        },
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

/** Digest a tag points at, or undefined when the registry does not know it. */
async function digestOf(
    runner: StartedTestContainer,
    reference: string,
): Promise<string | undefined> {
    const digest = await runner.exec([
        "crane",
        "digest",
        "--insecure",
        reference,
    ]);
    return digest.exitCode === 0 ? digest.output.trim() : undefined;
}

async function tagsOf(
    runner: StartedTestContainer,
    repository: string,
): Promise<string[]> {
    const tags = await runner.exec(["crane", "ls", "--insecure", repository]);
    expect(tags.exitCode).toBe(0);
    return tags.output.trim().split("\n").sort();
}

/** Points a tag at an image of its own, so a test sees whether it moved. */
async function seedTag(
    runner: StartedTestContainer,
    reference: string,
): Promise<string> {
    const seeded = await runner.exec([
        "bash",
        "-c",
        `tar -cf /tmp/empty.tar -T /dev/null && crane append --insecure -f /tmp/empty.tar -t ${reference} >/dev/null 2>&1 && crane digest --insecure ${reference}`,
    ]);
    expect(seeded.exitCode).toBe(0);
    return seeded.output.trim();
}

const login = `echo ci-password | docker login -u ci --password-stdin ${authRegistryHost} >/dev/null`;

/**
 * CI runs the image whose RUN steps ran under qemu on hardware of its own
 * architecture (docs/testing.md). This directory takes it as a tarball that
 * `docker load` reads.
 */
const imageExportDirectory = process.env.IMAGE_EXPORT_DIR;

async function exportForeignImage(
    runner: StartedTestContainer,
    reference: string,
): Promise<void> {
    const pulled = await runner.exec([
        "crane",
        "pull",
        "--insecure",
        "--platform",
        `linux/${foreign}`,
        reference,
        "/builds/export.tar",
    ]);
    expect(pulled.exitCode).toBe(0);
    await mkdir(imageExportDirectory as string, { recursive: true });
    await copyFile(
        join(queueDirectory, "export.tar"),
        join(imageExportDirectory as string, `linux-${foreign}.tar`),
    );
    await rm(join(queueDirectory, "export.tar"));
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

    // In the sandbox root owns the user namespace, so the unpack keeps the
    // capability. The patched warning only shows on the path without emulation.
    it("builds on a base image with file capabilities and warns without emulation", async () => {
        const builder = await startBuilder({ seccomp: true });
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

    it.each(buildPaths)(
        "installs a package with an Alpine conffile on a Debian base image $name",
        async ({ options }) => {
            const builder = await startBuilder(options);
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
        },
        600_000,
    );

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
        const builders = await superviseBuilders({ seccomp: true });
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
            await builders.stop();
        }
    }, 900_000);

    it("runs RUN steps for the other architecture under qemu", async () => {
        const builders = await superviseBuilders();
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
            await builders.stop();
        }
    }, 900_000);

    it("builds a base image with file capabilities for the other architecture", async () => {
        const builders = await superviseBuilders();
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
            await builders.stop();
        }
    }, 900_000);

    it("pushes one index for two platforms to a registry that needs a login", async () => {
        const builders = await superviseBuilders();
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
                    "RUN uname -m > /machine && apk add --no-cache file",
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

            if (imageExportDirectory) {
                await exportForeignImage(runner, image);
            }
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 1_200_000);

    it("refuses a failed platform of a multi platform build without touching the tag", async () => {
        const builders = await superviseBuilders();
        const runner = await startRunner();
        try {
            const image = `${registryHost}/partial:1`;
            const previous = await runner.exec([
                "bash",
                "-c",
                `tar -cf /tmp/empty.tar -T /dev/null && crane append --insecure -f /tmp/empty.tar -t ${image} >/dev/null 2>&1 && crane digest --insecure ${image}`,
            ]);
            expect(previous.exitCode).toBe(0);

            await writeContext(
                runner,
                [
                    "FROM alpine:3.20",
                    "ARG TARGETARCH",
                    `RUN test "$TARGETARCH" = ${native}`,
                ].join("\n"),
            );
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform linux/${native},linux/${foreign} --push -t ${image} . 2>&1`,
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain(
                `the build for linux/${foreign} failed with exit code`,
            );
            expect(build.output).toContain("nothing was pushed");
            expect(build.output).not.toContain("pushing");

            const digest = await runner.exec([
                "crane",
                "digest",
                "--insecure",
                image,
            ]);
            expect(digest.output.trim()).toBe(previous.output.trim());
            const tags = await runner.exec([
                "crane",
                "ls",
                "--insecure",
                `${registryHost}/partial`,
            ]);
            expect(tags.output.trim()).toBe("1");
            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 900_000);

    it("moves no tag when the upload to a second repository fails", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            const first = `${registryHost}/upload-fails:1`;
            const second = `${authRegistryHost}/upload-fails:1`;
            const previous = await seedTag(runner, first);

            await writeContext(runner, "FROM alpine:3.20\nRUN echo new > /new");
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --push -t ${first} -t ${second} . 2>&1`,
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toMatch(/401 Unauthorized|UNAUTHORIZED/);
            expect(build.output).toMatch(
                new RegExp(
                    `uploading sha256:[0-9a-f]{64} to ${authRegistryHost}/upload-fails failed, no tag was changed`,
                ),
            );
            expect(build.output).not.toContain("tagging");

            expect(await digestOf(runner, first)).toBe(previous);
            expect(
                await tagsOf(runner, `${registryHost}/upload-fails`),
            ).toEqual(["1"]);
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("moves the tags back when a later tag cannot be set", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            const existing = `${registryHost}/rollback:1`;
            const added = `${registryHost}/rollback:new`;
            const refused = `${registryHost}/rollback-refused:1`;
            const previous = await seedTag(runner, existing);

            // Registries that refuse a tag after accepting the upload (a tag
            // protection rule, a quota on manifests) cannot be set up with
            // registry:2, so crane refuses that one tag instead.
            const fake = await runner.exec([
                "bash",
                "-c",
                [
                    "mkdir -p /tmp/fake && cat > /tmp/fake/crane <<'CRANE'",
                    "#!/usr/bin/env bash",
                    `if [[ "$1" == tag && "$2" == ${registryHost}/rollback-refused@* ]]; then`,
                    '    echo "Error: PUT manifests/$3: DENIED: tag is protected" >&2',
                    "    exit 1",
                    "fi",
                    'exec /usr/local/bin/crane "$@"',
                    "CRANE",
                    "chmod +x /tmp/fake/crane",
                ].join("\n"),
            ]);
            expect(fake.exitCode).toBe(0);

            await writeContext(runner, "FROM alpine:3.20\nRUN echo new > /new");
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && PATH=/tmp/fake:$PATH docker build --push -t ${existing} -t ${added} -t ${refused} --iidfile /tmp/iid . 2>&1`,
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain("DENIED: tag is protected");
            expect(build.output).toContain(
                `${existing} points at ${previous} again`,
            );
            expect(build.output).toContain(
                `${added} did not exist before and stays at sha256:`,
            );
            expect(build.output).toContain(`${refused} was not changed`);
            expect(build.output).toContain(
                `tagging ${refused} failed, every tag that existed before points at its previous image again`,
            );

            expect(await digestOf(runner, existing)).toBe(previous);
            const pushed = await digestOf(runner, added);
            expect(pushed).toMatch(/^sha256:[0-9a-f]{64}$/);
            expect(pushed).not.toBe(previous);
            expect(await digestOf(runner, refused)).toBeUndefined();
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("points every tag of a multi platform build at one index", async () => {
        const builders = await superviseBuilders();
        const runner = await startRunner();
        try {
            const tags = [
                `${registryHost}/fanout:1`,
                `${registryHost}/fanout:2`,
                `${authRegistryHost}/fanout:1`,
            ];
            await writeContextFile(runner, "greeting", "moin");
            await writeContext(
                runner,
                "FROM alpine:3.20\nCOPY greeting /greeting",
            );
            const previous = await seedTag(runner, tags[0]);

            const build = await runner.exec([
                "bash",
                "-c",
                [
                    `cd /home/runner/app && ${login} &&`,
                    `docker build --platform linux/amd64,linux/arm64 --push ${tags.map((tag) => `-t ${tag}`).join(" ")}`,
                    "--iidfile /tmp/iid . 2>&1",
                ].join(" "),
            ]);
            expect(build.exitCode).toBe(0);

            const index = (
                await runner.exec(["cat", "/tmp/iid"])
            ).output.trim();
            expect(index).toMatch(/^sha256:[0-9a-f]{64}$/);
            expect(index).not.toBe(previous);
            for (const tag of tags) {
                expect(await digestOf(runner, tag)).toBe(index);
            }
            const manifest = await runner.exec([
                "crane",
                "manifest",
                "--insecure",
                tags[2],
            ]);
            const parsed = JSON.parse(manifest.output) as {
                mediaType: string;
                manifests: { platform: { architecture: string; os: string } }[];
            };
            expect(parsed.mediaType).toBe(
                "application/vnd.oci.image.index.v1+json",
            );
            expect(
                parsed.manifests
                    .map(
                        (entry) =>
                            `${entry.platform.os}/${entry.platform.architecture}`,
                    )
                    .sort(),
            ).toEqual(["linux/amd64", "linux/arm64"]);
            expect(
                await readFromImage(
                    runner,
                    tags[2],
                    "greeting",
                    `linux/${foreign}`,
                ),
            ).toBe("moin");

            expect(await tagsOf(runner, `${registryHost}/fanout`)).toEqual([
                "1",
                "2",
            ]);
            expect(await tagsOf(runner, `${authRegistryHost}/fanout`)).toEqual([
                "1",
            ]);
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 900_000);

    it("points every tag of a single platform build at one manifest", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            const tags = [
                `${registryHost}/solo:1`,
                `${registryHost}/solo:2`,
                `${authRegistryHost}/solo:1`,
            ];
            await writeContext(
                runner,
                "FROM alpine:3.20\nRUN echo solo > /solo",
            );
            const previous = await seedTag(runner, tags[0]);

            const build = await runner.exec([
                "bash",
                "-c",
                [
                    `cd /home/runner/app && ${login} &&`,
                    `docker build --push ${tags.map((tag) => `-t ${tag}`).join(" ")}`,
                    "--iidfile /tmp/iid --metadata-file /tmp/metadata.json . 2>&1",
                ].join(" "),
            ]);
            expect(build.exitCode).toBe(0);

            const manifest = (
                await runner.exec(["cat", "/tmp/iid"])
            ).output.trim();
            expect(manifest).toMatch(/^sha256:[0-9a-f]{64}$/);
            expect(manifest).not.toBe(previous);
            for (const tag of tags) {
                expect(await digestOf(runner, tag)).toBe(manifest);
            }
            const metadata = await runner.exec(["cat", "/tmp/metadata.json"]);
            expect(JSON.parse(metadata.output)).toMatchObject({
                "containerimage.digest": manifest,
                "image.name": tags.join(","),
            });
            expect(await readFromImage(runner, tags[2], "solo")).toBe("solo");

            expect(await tagsOf(runner, `${registryHost}/solo`)).toEqual([
                "1",
                "2",
            ]);
            expect(await tagsOf(runner, `${authRegistryHost}/solo`)).toEqual([
                "1",
            ]);
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("keeps two builds of two runners apart that share one queue", async () => {
        const builders = await superviseBuilders();
        const runners = [await startRunner(), await startRunner()];
        try {
            const names = ["first", "second"];
            await Promise.all(
                runners.map((runner, index) =>
                    writeContext(
                        runner,
                        `FROM alpine:3.20\nRUN echo ${names[index]} > /who`,
                    ),
                ),
            );
            const builds = await Promise.all(
                runners.map((runner, index) =>
                    runner.exec([
                        "bash",
                        "-c",
                        `cd /home/runner/app && docker build --push -t ${registryHost}/shared-${names[index]}:1 . 2>&1`,
                    ]),
                ),
            );
            for (const [index, build] of builds.entries()) {
                expect(build.exitCode).toBe(0);
                const runner = runners[index] as StartedTestContainer;
                expect(
                    await readFromImage(
                        runner,
                        `${registryHost}/shared-${names[index]}:1`,
                        "who",
                    ),
                ).toBe(names[index]);
            }
            const queue = await (runners[0] as StartedTestContainer).exec([
                "ls",
                "/builds/queue",
            ]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await Promise.all(runners.map((runner) => runner.stop()));
            await builders.stop();
        }
    }, 900_000);

    it("fails a build in seconds when its builder is replaced mid build", async () => {
        const builders = await superviseBuilders();
        const runner = await startRunner();
        try {
            await writeContext(runner, "FROM alpine:3.20\nRUN sleep 300");
            const build = runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t replaced:local . 2>&1",
            ]);
            const running = await runner.exec([
                "bash",
                "-c",
                "for _ in $(seq 120); do grep -qs 'sleep 300' /builds/queue/*/log && exit 0; sleep 1; done; exit 1",
            ]);
            expect(running.exitCode).toBe(0);

            await builders.kill();
            const killed = Date.now();
            const result = await build;
            expect(Date.now() - killed).toBeLessThan(60_000);
            expect(result.exitCode).not.toBe(0);
            expect(result.output).toContain(
                "replaced before the build finished",
            );
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 600_000);

    it.each(buildPaths)(
        "stops a build after BUILD_TIMEOUT $name",
        async ({ options }) => {
            const builder = await startBuilder({
                ...options,
                environment: { BUILD_TIMEOUT: "10" },
            });
            const runner = await startRunner();
            try {
                await writeContext(runner, "FROM alpine:3.20\nRUN sleep 300");
                const started = Date.now();
                const build = await runner.exec([
                    "bash",
                    "-c",
                    "cd /home/runner/app && docker build -t slow:local . 2>&1",
                ]);
                expect(Date.now() - started).toBeLessThan(90_000);
                expect(build.exitCode).not.toBe(0);
                expect(build.output).toContain(
                    "the build took longer than BUILD_TIMEOUT=10s",
                );

                // A builder that still ran would block every later build of the stack.
                const client = await getContainerRuntimeClient();
                let running = true;
                for (let attempt = 0; running && attempt < 20; attempt++) {
                    const info = await client.container.inspect(
                        client.container.getById(builder.getId()),
                    );
                    running = info.State.Running ?? false;
                    if (running) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 500),
                        );
                    }
                }
                expect(running).toBe(false);
            } finally {
                await runner.stop();
                await builder.stop();
            }
        },
        600_000,
    );

    it("takes back a job no builder claimed within the timeout of the runner", async () => {
        const runner = await startRunner();
        try {
            await writeContext(runner, "FROM alpine:3.20");
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && mstudio-build --timeout 3 -t unclaimed:local . 2>&1",
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain(
                "no builder took the job within 3s, so it was taken back",
            );
            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
        }
    }, 300_000);

    it("keeps a build for one other platform without --push in the image store", async () => {
        const builders = await superviseBuilders();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                "FROM alpine:3.20\nRUN uname -m > /machine",
            );
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --platform ${foreign} --load -t other:local . 2>&1`,
            ]);
            expect(build.exitCode).toBe(0);
            expect(build.output).toContain("--load has no daemon to load into");

            const architecture = await runner.exec([
                "bash",
                "-c",
                "docker save -o /tmp/other.tar other:local && tar -xOf /tmp/other.tar \"$(tar -xOf /tmp/other.tar manifest.json | jq -r '.[0].Config')\" | jq -r .architecture",
            ]);
            expect(architecture.output.trim()).toBe(foreign);

            const both = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build --platform linux/amd64,linux/arm64 -t both:local . 2>&1",
            ]);
            expect(both.exitCode).not.toBe(0);
            expect(both.output).toContain("needs --push");
            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 900_000);

    it("runs a stage with a literal FROM --platform of the other architecture in a native build", async () => {
        const builders = await superviseBuilders();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                [
                    `FROM --platform=linux/${foreign} alpine:3.20 AS other`,
                    "RUN uname -m > /machine",
                    "FROM alpine:3.20",
                    "COPY --from=other /machine /machine",
                ].join("\n"),
            );
            const image = `${registryHost}/literal-platform:1`;
            const build = await runner.exec([
                "bash",
                "-c",
                `cd /home/runner/app && docker build --push -t ${image} . 2>&1`,
            ]);
            expect(build.exitCode).toBe(0);
            expect(await readFromImage(runner, image, "machine")).toBe(
                unameMachine[foreign],
            );
            expect(await configArchitecture(runner, image)).toBe(native);
        } finally {
            await runner.stop();
            await builders.stop();
        }
    }, 900_000);

    it("explains exec format error in a build without --platform", async () => {
        const builder = await startBuilder();
        const runner = await startRunner();
        try {
            await writeContext(
                runner,
                [
                    "FROM alpine:3.20",
                    "RUN printf 'echo no interpreter line\\n' > /no-shebang && chmod +x /no-shebang",
                    'RUN ["/no-shebang"]',
                ].join("\n"),
            );
            const build = await runner.exec([
                "bash",
                "-c",
                "cd /home/runner/app && docker build -t format:local . 2>&1",
            ]);
            expect(build.exitCode).not.toBe(0);
            expect(build.output).toContain(
                `a RUN step started a binary that does not match linux/${native}`,
            );
            expect(build.output).not.toContain("cannot run RUN steps");
        } finally {
            await runner.stop();
            await builder.stop();
        }
    }, 600_000);

    it("normalizes the platform list and refuses other architectures", async () => {
        const runner = await startRunner();
        try {
            const normalized = await runner.exec([
                "mstudio-platform-check",
                " linux/arm64/v8, arm64 ,  linux/amd64,x86_64",
            ]);
            expect(normalized.exitCode).toBe(0);
            expect(normalized.output.trim().split("\n")).toEqual([
                "linux/arm64",
                "linux/amd64",
            ]);

            await writeContext(runner, "FROM alpine:3.20");
            for (const platforms of [
                "linux/s390x",
                "linux/amd64, linux/s390x",
            ]) {
                const build = await runner.exec([
                    "bash",
                    "-c",
                    `cd /home/runner/app && docker build --platform "${platforms}" --push -t ${registryHost}/refused:1 . 2>&1`,
                ]);
                expect(build.exitCode).not.toBe(0);
                expect(build.output).toContain(
                    "platform linux/s390x is not supported",
                );
            }
            const queue = await runner.exec(["ls", "/builds/queue"]);
            expect(queue.output.trim()).toBe("");
        } finally {
            await runner.stop();
        }
    }, 300_000);
});
