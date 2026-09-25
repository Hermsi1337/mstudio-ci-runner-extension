import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

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

export function withDockerApi(
    environment: Record<string, string>,
): Record<string, string> {
    return { ...environment, DOCKER_HOST };
}

export function withoutDockerApi(
    environment: Record<string, string>,
): Record<string, string> {
    const { DOCKER_HOST: _removed, ...rest } = environment;

    return rest;
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

/**
 * The key is derived from the encryption secrets of the extension, so neither
 * a database dump nor the environment of a stack reveals it.
 */
export function deriveSecretKey(masterPassword: string, salt: string): Buffer {
    return Buffer.from(
        hkdfSync("sha256", masterPassword, salt, "docker-api-secret", 32),
    );
}

export function deriveSecret(
    key: Buffer,
    stackId: string,
    nonce: string,
): string {
    const mac = createHmac("sha256", key)
        .update(`${stackId}:${nonce}`)
        .digest("base64url");

    return `${SECRET_PREFIX}${mac}`;
}

export function secretMatches(
    key: Buffer,
    stackId: string,
    nonce: string,
    presented: string,
): boolean {
    const expected = Buffer.from(deriveSecret(key, stackId, nonce));
    const actual = Buffer.from(presented);

    return (
        expected.length === actual.length && timingSafeEqual(expected, actual)
    );
}

export function bearerToken(header: string | null): string | undefined {
    const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");

    return match?.[1];
}
