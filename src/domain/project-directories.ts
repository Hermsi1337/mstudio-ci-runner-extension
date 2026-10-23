import { CI_WORK_DIRECTORY } from "@/docker-api.ts";
import type { ProjectDirectory } from "@/generated/extension-api";
import { ProjectDirectoryError } from "@/global-errors.ts";
import {
    normalizeProjectDirectories,
    projectDirectoryIssues,
    RUNNER_RESERVED_TARGETS,
} from "@/project-directories.ts";

/**
 * The form checks the same rules, except the work directory of Docker in
 * jobs: it mounts at its path in the project, which only the server knows.
 * Returns the list normalized, the way the row stores it.
 */
export function checkedProjectDirectories(
    directories: readonly ProjectDirectory[],
    projectDirectory: string,
): ProjectDirectory[] {
    const [issue] = projectDirectoryIssues(directories, [
        ...RUNNER_RESERVED_TARGETS,
        `${projectDirectory}/${CI_WORK_DIRECTORY}`,
    ]);
    if (issue) {
        throw new ProjectDirectoryError(
            issue.messageKey,
            issue.params ?? {},
            `projectDirectories.${issue.index}.${issue.field}`,
        );
    }

    return normalizeProjectDirectories(directories);
}
