import { describe, expect, it } from "vitest";
import { cacheMount } from "@/domain/cache.ts";
import { DATA_VOLUME_MOUNT } from "@/domain/providers/types.ts";
import type { ProjectDirectory } from "@/generated/extension-api";
import {
    normalizeProjectDirectories,
    normalizeSource,
    normalizeTarget,
    PROJECT_DIRECTORIES_VARIABLE,
    projectDirectoryIssues,
    RUNNER_RESERVED_TARGETS,
    sameProjectDirectories,
    suggestTarget,
    withProjectDirectories,
} from "./project-directories.ts";

const directory = (
    source: string,
    target: string,
    readOnly = false,
): ProjectDirectory => ({ source, target, readOnly });

const keysOf = (directories: ProjectDirectory[], reserved?: string[]) =>
    projectDirectoryIssues(directories, reserved).map(
        ({ index, field, messageKey }) => `${index}.${field} ${messageKey}`,
    );

describe("project directory paths", () => {
    it("normalizes a source relative to the project directory", () => {
        expect(normalizeSource("html/my-app")).toBe("html/my-app");
        expect(normalizeSource(" ./html//my-app/ ")).toBe("html/my-app");
        expect(normalizeSource("html/old/../my-app")).toBe("html/my-app");
        expect(normalizeSource("html/..")).toBe("");
    });

    it("refuses a source whose .. leads out of the project directory", () => {
        expect(normalizeSource("..")).toBeNull();
        expect(normalizeSource("html/../../p-other/html")).toBeNull();
        expect(normalizeSource("../p-4e7tz3/html")).toBeNull();
    });

    it("normalizes a target to an absolute path", () => {
        expect(normalizeTarget("/deploy/my-app/")).toBe("/deploy/my-app");
        expect(normalizeTarget("//deploy/./a/../my-app")).toBe(
            "/deploy/my-app",
        );
        expect(normalizeTarget("/../deploy")).toBe("/deploy");
        expect(normalizeTarget("/..")).toBe("/");
    });

    it("suggests a target from the last segment of the source", () => {
        expect(suggestTarget("html/my-app")).toBe("/deploy/my-app");
        expect(suggestTarget("html/my-app/")).toBe("/deploy/my-app");
        expect(suggestTarget("")).toBe("");
        expect(suggestTarget("../outside")).toBe("");
    });
});

describe("project directory validation", () => {
    it("accepts directories next to each other", () => {
        expect(
            keysOf([
                directory("html/a", "/deploy/a"),
                directory("html/b", "/deploy/b", true),
                directory("files", "/srv/files"),
            ]),
        ).toEqual([]);
    });

    it("rejects every broken source", () => {
        expect(
            keysOf([
                directory(" ", "/deploy/a"),
                directory("/home/p-4e7tz3/html", "/deploy/b"),
                directory("html/../../etc", "/deploy/c"),
                directory("html/..", "/deploy/d"),
                directory(".", "/deploy/e"),
                directory("html:ro", "/deploy/f"),
            ]),
        ).toEqual([
            "0.source error.projectDirectory.sourceRequired",
            "1.source error.projectDirectory.sourceAbsolute",
            "2.source error.projectDirectory.sourceOutside",
            "3.source error.projectDirectory.sourceProjectRoot",
            "4.source error.projectDirectory.sourceProjectRoot",
            "5.source error.projectDirectory.colon",
        ]);
    });

    it("rejects every broken target", () => {
        expect(
            keysOf([
                directory("a", ""),
                directory("b", "deploy/b"),
                directory("c", "/"),
                directory("d", "/deploy/..//"),
                directory("e", "/deploy/e:ro"),
            ]),
        ).toEqual([
            "0.target error.projectDirectory.targetRequired",
            "1.target error.projectDirectory.targetRelative",
            "2.target error.projectDirectory.targetRoot",
            "3.target error.projectDirectory.targetRoot",
            "4.target error.projectDirectory.colon",
        ]);
    });

    it.each([
        ["/home/runner/data", "/home/runner/data"],
        ["/home/runner/data/_work", "/home/runner/data"],
        ["/home/runner/.cache/npm", "/home/runner/.cache"],
        ["/builds", "/builds"],
        ["/builds/../builds/x", "/builds"],
        ["/home/runner", "/home/runner/data"],
        ["/home", "/home/runner/data"],
    ])("rejects the target %s, which overlaps %s", (target, reserved) => {
        expect(projectDirectoryIssues([directory("a", target)])).toEqual([
            {
                index: 0,
                field: "target",
                messageKey: "error.projectDirectory.targetReserved",
                params: { path: reserved },
            },
        ]);
    });

    it.each(["/home/runner/deploy", "/buildsx", "/srv/builds"])(
        "accepts the target %s next to the paths the runner uses",
        (target) => {
            expect(keysOf([directory("a", target)])).toEqual([]);
        },
    );

    it("takes further reserved paths from the caller", () => {
        const workRoot = "/home/p-4e7tz3/.ci-work";
        const reserved = [...RUNNER_RESERVED_TARGETS, workRoot];
        expect(
            keysOf(
                [
                    directory("a", `${workRoot}/stack`),
                    directory("b", "/home/p-4e7tz3"),
                ],
                reserved,
            ),
        ).toEqual([
            "0.target error.projectDirectory.targetReserved",
            "1.target error.projectDirectory.targetReserved",
        ]);
        expect(
            keysOf([directory("c", "/home/p-4e7tz3/deploy")], reserved),
        ).toEqual([]);
    });

    it("rejects a duplicate target on the later entry only", () => {
        expect(
            keysOf([directory("a", "/deploy/a"), directory("b", "/deploy/a/")]),
        ).toEqual(["1.target error.projectDirectory.targetDuplicate"]);
    });

    it("rejects targets that contain each other on both entries", () => {
        expect(
            keysOf([
                directory("a", "/deploy"),
                directory("b", "/deploy/b"),
                directory("c", "/deployment"),
            ]),
        ).toEqual([
            "0.target error.projectDirectory.targetNested",
            "1.target error.projectDirectory.targetNested",
        ]);
    });

    it("rejects entries beyond the limit", () => {
        const directories = Array.from({ length: 11 }, (_, index) =>
            directory(`html/${index}`, `/deploy/${index}`),
        );
        expect(keysOf(directories)).toEqual([
            "10.source error.projectDirectory.tooMany",
        ]);
    });

    it("reserves the paths of the runner's own volumes", () => {
        expect(RUNNER_RESERVED_TARGETS).toContain(
            DATA_VOLUME_MOUNT.split(":")[1],
        );
        expect(RUNNER_RESERVED_TARGETS).toContain(cacheMount.split(":")[1]);
    });
});

describe("project directory mounts", () => {
    it("stores the normalized paths", () => {
        expect(
            normalizeProjectDirectories([
                directory(" ./html//a/ ", "/deploy//a/", true),
            ]),
        ).toEqual([directory("html/a", "/deploy/a", true)]);
    });

    it("compares lists by entry and order", () => {
        const list = [directory("a", "/deploy/a")];
        expect(
            sameProjectDirectories(list, [directory("a", "/deploy/a")]),
        ).toBe(true);
        expect(
            sameProjectDirectories(list, [directory("a", "/deploy/a", true)]),
        ).toBe(false);
        expect(sameProjectDirectories(list, [])).toBe(false);
    });

    it("mounts the sources below the project directory after the volumes", () => {
        expect(
            withProjectDirectories(
                {
                    environment: { A: "1" },
                    volumes: ["runner-a-data:/home/runner/data"],
                },
                "/home/p-4e7tz3",
                [
                    directory("html/a", "/deploy/a"),
                    directory("html/b", "/deploy/b", true),
                ],
            ),
        ).toEqual({
            environment: {
                A: "1",
                [PROJECT_DIRECTORIES_VARIABLE]: "/deploy/a:/deploy/b",
            },
            volumes: [
                "runner-a-data:/home/runner/data",
                "/home/p-4e7tz3/html/a:/deploy/a",
                "/home/p-4e7tz3/html/b:/deploy/b:ro",
            ],
        });
    });

    it("replaces the mounts at old and new targets and keeps the others", () => {
        expect(
            withProjectDirectories(
                {
                    environment: {
                        A: "1",
                        [PROJECT_DIRECTORIES_VARIABLE]: "/deploy/a:/deploy/b",
                    },
                    volumes: [
                        "runner-a-data:/home/runner/data",
                        "/home/p-4e7tz3/html/a:/deploy/a",
                        "/home/p-4e7tz3/html/b:/deploy/b:ro",
                        "/home/p-4e7tz3/manual:/manual",
                        "/home/p-4e7tz3/html:/var/www",
                    ],
                },
                "/home/p-4e7tz3",
                [
                    directory("html/b", "/deploy/b"),
                    directory("html/www", "/var/www", true),
                ],
                [
                    directory("html/a", "/deploy/a"),
                    directory("html/b", "/deploy/b", true),
                ],
            ),
        ).toEqual({
            environment: {
                A: "1",
                [PROJECT_DIRECTORIES_VARIABLE]: "/deploy/b:/var/www",
            },
            volumes: [
                "runner-a-data:/home/runner/data",
                "/home/p-4e7tz3/manual:/manual",
                "/home/p-4e7tz3/html/b:/deploy/b",
                "/home/p-4e7tz3/html/www:/var/www:ro",
            ],
        });
    });

    it("drops the mounts and the variable with the last directory", () => {
        expect(
            withProjectDirectories(
                {
                    environment: {
                        A: "1",
                        [PROJECT_DIRECTORIES_VARIABLE]: "/deploy/a",
                    },
                    volumes: ["/home/p-4e7tz3/html/a:/deploy/a"],
                },
                "/home/p-4e7tz3",
                [],
                [directory("html/a", "/deploy/a")],
            ),
        ).toEqual({ environment: { A: "1" }, volumes: [] });
    });
});
