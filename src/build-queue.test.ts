import { describe, expect, it } from "vitest";
import {
    isBuildQueueMount,
    queueMountFor,
    withBuildQueue,
    withoutBuildQueue,
} from "./build-queue.ts";

const queueMount = queueMountFor("/home/p-abc123");

describe("build queue mounts", () => {
    it("mounts the queue below the project directory", () => {
        expect(queueMount).toBe("/home/p-abc123/ci-builds:/builds");
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
