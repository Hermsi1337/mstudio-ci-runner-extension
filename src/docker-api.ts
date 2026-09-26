import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pieces of "Docker in jobs" without server dependencies, so the domain and
 * the unit tests share them. The service and the token flow are described in
 * docs/docker-api.md.
 */
export const DOCKER_API_SERVICE_NAME = "docker";
export const DOCKER_API_PORT = 2375;
export const DOCKER_HOST = `tcp://${DOCKER_API_SERVICE_NAME}:${DOCKER_API_PORT}`;
export const DOCKER_API_STATE_DIRECTORY = ".docker-adapter";
export const DOCKER_API_STATE_PATH = "/state";
/** Services the adapter creates carry this prefix in their description. */
export const DOCKER_API_CONTAINER_PREFIX = "docker-adapter ";
export const DOCKER_API_TOKEN_PATH = "/api/docker-api/token";

const SECRET_PREFIX = "mdapi_";

/**
 * Work directories of the runners of a stack live on the project file system,
 * mounted at the same path they have there. A container a job starts can then
 * bind-mount the workspace: the path the runner knows is the project path the
 * adapter needs. The externals of the GitHub runner (node for actions inside
 * `container:` jobs) are shared per runner version below the same root.
 */
export const CI_WORK_DIRECTORY = ".ci-work";

export function ciWorkRoot(projectDirectory: string, stackId: string): string {
    return `${projectDirectory}/${CI_WORK_DIRECTORY}/${stackId}`;
}

function isCiWorkMount(mount: string): boolean {
    return (
        mount.startsWith("/") &&
        mount.split(":")[0].includes(`/${CI_WORK_DIRECTORY}/`)
    );
}

export interface DockerApiRunner {
    environment: Record<string, string>;
    mounts: string[];
}

export function withDockerApi(
    runner: DockerApiRunner,
    workRoot: string,
    serviceName: string,
): DockerApiRunner {
    const base = withoutDockerApi(runner);
    return {
        environment: {
            ...base.environment,
            DOCKER_HOST,
            MSTUDIO_WORK_ROOT: `${workRoot}/${serviceName}`,
            MSTUDIO_EXTERNALS_ROOT: `${workRoot}/externals`,
        },
        mounts: [...base.mounts, `${workRoot}:${workRoot}`],
    };
}

export function withoutDockerApi(runner: DockerApiRunner): DockerApiRunner {
    const {
        DOCKER_HOST: _host,
        MSTUDIO_WORK_ROOT: _work,
        MSTUDIO_EXTERNALS_ROOT: _externals,
        ...environment
    } = runner.environment;

    return {
        environment,
        mounts: runner.mounts.filter((mount) => !isCiWorkMount(mount)),
    };
}

/** Whether a runner service uses the service `docker` of its stack. */
export function usesDockerApi(
    environment: Record<string, string> | undefined,
): boolean {
    return environment?.DOCKER_HOST === DOCKER_HOST;
}

/**
 * Keeps a path in the public URL, so an extension served below a prefix gets
 * its token requests too.
 */
export function tokenUrlFor(publicUrl: string): string {
    const base = publicUrl.endsWith("/") ? publicUrl : `${publicUrl}/`;

    return new URL(DOCKER_API_TOKEN_PATH.slice(1), base).toString();
}

export function stateMountFor(
    projectDirectory: string,
    stackId: string,
): string {
    return `${projectDirectory}/${DOCKER_API_STATE_DIRECTORY}/${stackId}:${DOCKER_API_STATE_PATH}`;
}

/** 32 random bytes, prefixed so secret scanners recognize a leaked one. */
export function generateSecret(): string {
    return `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/**
 * A plain SHA-256 is enough: the secret is random with 256 bits, so there is
 * nothing to guess and no need for a slow or keyed hash.
 */
export function hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
}

export function secretMatches(storedHash: string, presented: string): boolean {
    const expected = Buffer.from(storedHash, "hex");
    const actual = Buffer.from(hashSecret(presented), "hex");

    return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
    );
}

export function bearerToken(header: string | null): string | undefined {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");

    return match?.[1];
}
