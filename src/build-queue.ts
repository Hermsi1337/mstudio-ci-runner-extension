/**
 * Mount of the build queue that runners and the builder service of a stack
 * share. Pure helpers without server dependencies, so the domain and the tests
 * can use them without a database or environment.
 *
 * The project file system is shared by every container of the project, so the
 * queue carries the stack id: two stacks of one project run two builders, and
 * without the id they would poll the same queue and claim each other's jobs.
 */
export const QUEUE_DIRECTORY = "ci-builds";
export const QUEUE_MOUNT_PATH = "/builds";

export function queueMountFor(
    projectDirectory: string,
    stackId: string,
): string {
    return `${projectDirectory}/${QUEUE_DIRECTORY}/${stackId}:${QUEUE_MOUNT_PATH}`;
}

export function isBuildQueueMount(mount: string): boolean {
    return mount.endsWith(`:${QUEUE_MOUNT_PATH}`);
}

export function withBuildQueue(mounts: string[], queueMount: string): string[] {
    if (mounts.some(isBuildQueueMount)) {
        return mounts;
    }

    return [...mounts, queueMount];
}

export function withoutBuildQueue(mounts: string[]): string[] {
    return mounts.filter((mount) => !isBuildQueueMount(mount));
}
