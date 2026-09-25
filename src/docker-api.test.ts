import { describe, expect, it } from "vitest";
import {
    bearerToken,
    DOCKER_HOST,
    deriveSecret,
    deriveSecretKey,
    secretMatches,
    stateMountFor,
    usesDockerApi,
    withDockerApi,
    withoutDockerApi,
} from "./docker-api.ts";

const key = deriveSecretKey("master", "salt");
const stackId = "3f9a7c21-6d4e-4b8a-a1c2-7e5d9f0b2c4a";

describe("docker api secret", () => {
    it("is stable for a stack and nonce", () => {
        expect(deriveSecret(key, stackId, "n1")).toBe(
            deriveSecret(key, stackId, "n1"),
        );
        expect(deriveSecret(key, stackId, "n1")).toMatch(/^mdapi_[\w-]{43}$/);
    });

    it("changes with the nonce, the stack and the key", () => {
        const secret = deriveSecret(key, stackId, "n1");
        expect(deriveSecret(key, stackId, "n2")).not.toBe(secret);
        expect(deriveSecret(key, "other-stack", "n1")).not.toBe(secret);
        expect(
            deriveSecret(deriveSecretKey("other", "salt"), stackId, "n1"),
        ).not.toBe(secret);
    });

    it("accepts only the matching secret", () => {
        const secret = deriveSecret(key, stackId, "n1");
        expect(secretMatches(key, stackId, "n1", secret)).toBe(true);
        expect(secretMatches(key, stackId, "n2", secret)).toBe(false);
        expect(secretMatches(key, stackId, "n1", `${secret}x`)).toBe(false);
        expect(secretMatches(key, stackId, "n1", "")).toBe(false);
    });

    it("reads the bearer token", () => {
        expect(bearerToken("Bearer mdapi_abc")).toBe("mdapi_abc");
        expect(bearerToken("bearer mdapi_abc")).toBe("mdapi_abc");
        expect(bearerToken("Basic abc")).toBeUndefined();
        expect(bearerToken(null)).toBeUndefined();
    });
});

describe("docker api environment", () => {
    it("adds and removes DOCKER_HOST", () => {
        const on = withDockerApi({ A: "1" });
        expect(on).toEqual({ A: "1", DOCKER_HOST });
        expect(usesDockerApi(on)).toBe(true);
        expect(withoutDockerApi(on)).toEqual({ A: "1" });
        expect(usesDockerApi({ DOCKER_HOST: "tcp://elsewhere:2375" })).toBe(
            false,
        );
    });

    it("mounts the state directory of the stack", () => {
        expect(stateMountFor("/home/p-abc", stackId)).toBe(
            `/home/p-abc/.docker-adapter/${stackId}:/state`,
        );
    });
});
