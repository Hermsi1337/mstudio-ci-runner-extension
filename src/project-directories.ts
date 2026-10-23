import { QUEUE_MOUNT_PATH } from "@/build-queue.ts";
import type { ProjectDirectory } from "@/generated/extension-api";
import type { MessageKey, MessageParams } from "@/i18n/index.ts";

/**
 * Directories of the project file system that a runner mounts next to its
 * volumes. Pure helpers without server dependencies: the forms run the same
 * checks as the domain, so a wrong path shows at its row before the request.
 * A mount string is `source:target[:ro]`, so neither path may hold a colon.
 */
export const MAX_PROJECT_DIRECTORIES = 10;
export const PROJECT_DIRECTORIES_VARIABLE = "MSTUDIO_PROJECT_DIRECTORIES";
export const RUNNER_RESERVED_TARGETS = [
    "/home/runner/data",
    "/home/runner/.cache",
    QUEUE_MOUNT_PATH,
] as const;

const TARGET_SUGGESTION_ROOT = "/deploy";

export type ProjectDirectoryField = "source" | "target";

export interface ProjectDirectoryIssue {
    index: number;
    field: ProjectDirectoryField;
    messageKey: MessageKey;
    params?: MessageParams;
}

/**
 * Drops empty and `.` segments and resolves `..`. A `..` above the start is
 * null for a relative path and stays at `/` for an absolute one, as the
 * kernel resolves it.
 */
function normalizeSegments(path: string, absolute: boolean): string[] | null {
    const segments: string[] = [];
    for (const segment of path.trim().split("/")) {
        if (segment === "" || segment === ".") {
            continue;
        }
        if (segment !== "..") {
            segments.push(segment);
        } else if (segments.length > 0 || absolute) {
            segments.pop();
        } else {
            return null;
        }
    }

    return segments;
}

/** Relative to the project directory; null when it leads out of it. */
export function normalizeSource(source: string): string | null {
    return normalizeSegments(source, false)?.join("/") ?? null;
}

export function normalizeTarget(target: string): string {
    return `/${(normalizeSegments(target, true) ?? []).join("/")}`;
}

function contains(outer: string, inner: string): boolean {
    return (
        inner === outer || inner.startsWith(outer === "/" ? "/" : `${outer}/`)
    );
}

function overlaps(a: string, b: string): boolean {
    return contains(a, b) || contains(b, a);
}

function sourceIssue(source: string): MessageKey | null {
    const trimmed = source.trim();
    if (trimmed === "") {
        return "error.projectDirectory.sourceRequired";
    }
    if (trimmed.startsWith("/")) {
        return "error.projectDirectory.sourceAbsolute";
    }
    if (trimmed.includes(":")) {
        return "error.projectDirectory.colon";
    }
    const normalized = normalizeSource(trimmed);
    if (normalized === null) {
        return "error.projectDirectory.sourceOutside";
    }
    if (normalized === "") {
        return "error.projectDirectory.sourceProjectRoot";
    }

    return null;
}

/**
 * Every rule a list breaks, at most one per field. `reservedTargets` holds
 * the paths the runner mounts itself; the domain adds the work directory of
 * Docker in jobs, which depends on the project.
 */
export function projectDirectoryIssues(
    directories: readonly ProjectDirectory[],
    reservedTargets: readonly string[] = RUNNER_RESERVED_TARGETS,
): ProjectDirectoryIssue[] {
    const issues: ProjectDirectoryIssue[] = [];
    const targets = directories.map(({ target }) => normalizeTarget(target));
    directories.forEach((directory, index) => {
        if (index >= MAX_PROJECT_DIRECTORIES) {
            issues.push({
                index,
                field: "source",
                messageKey: "error.projectDirectory.tooMany",
                params: { max: MAX_PROJECT_DIRECTORIES },
            });
            return;
        }
        const source = sourceIssue(directory.source);
        if (source) {
            issues.push({ index, field: "source", messageKey: source });
        }
        const target = targetIssue(
            directory.target,
            index,
            targets,
            reservedTargets,
        );
        if (target) {
            issues.push({ index, field: "target", ...target });
        }
    });

    return issues;
}

function targetIssue(
    raw: string,
    index: number,
    targets: string[],
    reservedTargets: readonly string[],
): Pick<ProjectDirectoryIssue, "messageKey" | "params"> | null {
    const trimmed = raw.trim();
    if (trimmed === "") {
        return { messageKey: "error.projectDirectory.targetRequired" };
    }
    if (!trimmed.startsWith("/")) {
        return { messageKey: "error.projectDirectory.targetRelative" };
    }
    if (trimmed.includes(":")) {
        return { messageKey: "error.projectDirectory.colon" };
    }
    const target = targets[index];
    if (target === "/") {
        return { messageKey: "error.projectDirectory.targetRoot" };
    }
    const reserved = reservedTargets.find((path) => overlaps(path, target));
    if (reserved) {
        return {
            messageKey: "error.projectDirectory.targetReserved",
            params: { path: reserved },
        };
    }
    const earlier = targets.slice(0, index);
    if (earlier.includes(target)) {
        return { messageKey: "error.projectDirectory.targetDuplicate" };
    }
    if (
        targets.some(
            (other, i) =>
                i !== index && other !== target && overlaps(other, target),
        )
    ) {
        return { messageKey: "error.projectDirectory.targetNested" };
    }

    return null;
}

/** Only for a list without issues. */
export function normalizeProjectDirectories(
    directories: readonly ProjectDirectory[],
): ProjectDirectory[] {
    return directories.map(({ source, target, readOnly }) => ({
        source: normalizeSource(source) ?? "",
        target: normalizeTarget(target),
        readOnly,
    }));
}

export function sameProjectDirectories(
    a: readonly ProjectDirectory[],
    b: readonly ProjectDirectory[],
): boolean {
    return (
        a.length === b.length &&
        a.every(
            (directory, index) =>
                directory.source === b[index].source &&
                directory.target === b[index].target &&
                directory.readOnly === b[index].readOnly,
        )
    );
}

/** `/deploy/<last segment of the source>`, empty while the source names none. */
export function suggestTarget(source: string): string {
    const segment = normalizeSource(source)?.split("/").pop();

    return segment ? `${TARGET_SUGGESTION_ROOT}/${segment}` : "";
}

export function projectDirectoryMount(
    projectDirectory: string,
    { source, target, readOnly }: ProjectDirectory,
): string {
    return `${projectDirectory}/${source}:${target}${readOnly ? ":ro" : ""}`;
}

/** Drops every mount at one of the targets, whoever declared it. */
export function withoutMountsAt(
    mounts: readonly string[],
    targets: readonly string[],
): string[] {
    return mounts.filter((mount) => !targets.includes(mount.split(":")[1]));
}

/** The variable mstudio-sync reads; absent without a directory. */
export function withProjectDirectoriesVariable(
    environment: Record<string, string>,
    directories: readonly ProjectDirectory[],
): Record<string, string> {
    const { [PROJECT_DIRECTORIES_VARIABLE]: _previous, ...rest } = environment;
    if (directories.length === 0) {
        return rest;
    }

    return {
        ...rest,
        [PROJECT_DIRECTORIES_VARIABLE]: directories
            .map(({ target }) => target)
            .join(":"),
    };
}
