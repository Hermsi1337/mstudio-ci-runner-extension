import { describe, expect, it } from "vitest";
import {
    imageMatches,
    isBuildQueueMount,
    isQueueMountOfStack,
    queueMountFor,
    withBuildQueue,
    withoutBuildQueue,
} from "./build-queue.ts";

const stackId = "71149a1c-a71a-4610-a45d-8e13e6aa1fc5";
const queueMount = queueMountFor("/home/p-abc123", stackId);

describe("build queue mounts", () => {
    it("mounts the queue of the stack below the project directory", () => {
        expect(queueMount).toBe(`/home/p-abc123/ci-builds/${stackId}:/builds`);
    });

    it("keeps the queue of another stack out", () => {
        const otherStack = queueMountFor("/home/p-abc123", "other-stack");
        expect(otherStack).not.toBe(queueMount);
    });

    it("recognizes the queue mount by its mount point", () => {
        expect(isBuildQueueMount(queueMount)).toBe(true);
        expect(isBuildQueueMount("data:/home/runner/data")).toBe(false);
    });

    it("adds the queue mount once", () => {
        const mounts = withBuildQueue(["data:/home/runner/data"], queueMount);
        expect(mounts).toEqual(["data:/home/runner/data", queueMount]);
        expect(withBuildQueue(mounts, queueMount)).toEqual(mounts);
    });

    it("removes the queue mount and keeps the volumes", () => {
        expect(
            withoutBuildQueue([
                "data:/home/runner/data",
                queueMount,
                "cache:/home/runner/.cache",
            ]),
        ).toEqual(["data:/home/runner/data", "cache:/home/runner/.cache"]);
    });
});

describe("the queue of one stack", () => {
    it("tells its own queue from the one of another stack", () => {
        expect(isQueueMountOfStack(queueMount, stackId)).toBe(true);
        expect(isQueueMountOfStack(queueMount, "other-stack")).toBe(false);
    });

    it("does not take any mount at /builds for a queue", () => {
        expect(
            isQueueMountOfStack("/home/p-abc123/other:/builds", stackId),
        ).toBe(false);
    });
});

describe("image comparison", () => {
    it("accepts the normalized form mittwald reports", () => {
        expect(imageMatches("library/alpine:3.20", "alpine:3.20")).toBe(true);
        expect(
            imageMatches(
                "ghcr.io/hermsi1337/mstudio-ci-builder:1.2.3",
                "ghcr.io/hermsi1337/mstudio-ci-builder:1.2.3",
            ),
        ).toBe(true);
    });

    it("sees a different version as different", () => {
        expect(
            imageMatches(
                "ghcr.io/hermsi1337/mstudio-ci-builder:1.2.3",
                "ghcr.io/hermsi1337/mstudio-ci-builder:1.3.0",
            ),
        ).toBe(false);
        expect(imageMatches(undefined, "alpine:3.20")).toBe(false);
    });

    it("does not confuse a suffix with the same image", () => {
        expect(imageMatches("alpine:3.20", "evil/alpine:3.20")).toBe(false);
    });
});
