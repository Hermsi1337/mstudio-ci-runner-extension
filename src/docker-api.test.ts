import { describe, expect, it } from "vitest";
import {
    bearerToken,
    DOCKER_HOST,
    generateSecret,
    hashSecret,
    secretMatches,
    stateMountFor,
    tokenUrlFor,
    usesDockerApi,
    withDockerApi,
    withoutDockerApi,
} from "./docker-api.ts";

const stackId = "3f9a7c21-6d4e-4b8a-a1c2-7e5d9f0b2c4a";

describe("docker api secret", () => {
    it("is random and recognizable", () => {
        const secret = generateSecret();
        expect(secret).toMatch(/^mdapi_[\w-]{43}$/);
        expect(generateSecret()).not.toBe(secret);
    });

    it("stores only the SHA-256", () => {
        expect(hashSecret("mdapi_abc")).toBe(
            "16c5874533ccf19559ce8372f6415e1f90eb8a74c18d98561bd1efed762d5a08",
        );
    });

    it("accepts only the matching secret", () => {
        const secret = generateSecret();
        const stored = hashSecret(secret);
        expect(secretMatches(stored, secret)).toBe(true);
        expect(secretMatches(stored, `${secret}x`)).toBe(false);
        expect(secretMatches(stored, "")).toBe(false);
        expect(secretMatches(hashSecret(generateSecret()), secret)).toBe(false);
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

describe("docker api token url", () => {
    it("keeps a path of the public URL", () => {
        expect(tokenUrlFor("https://ci.example.com")).toBe(
            "https://ci.example.com/api/docker-api/token",
        );
        expect(tokenUrlFor("https://host.example/ci-runner/")).toBe(
            "https://host.example/ci-runner/api/docker-api/token",
        );
        expect(tokenUrlFor("https://host.example/ci-runner")).toBe(
            "https://host.example/ci-runner/api/docker-api/token",
        );
    });
});
