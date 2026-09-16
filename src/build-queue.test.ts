import { describe, expect, it } from "vitest";
import {
    isBuildQueueMount,
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
