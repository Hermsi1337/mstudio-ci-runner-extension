/**
 * Mount of the build queue that runners and the builder service of a stack
 * share. Pure helpers without server dependencies, so the domain and the tests
 * can use them without a database or environment.
 */
export const QUEUE_DIRECTORY = "ci-builds";
export const QUEUE_MOUNT_PATH = "/builds";

export function queueMountFor(projectDirectory: string): string {
    return `${projectDirectory}/${QUEUE_DIRECTORY}:${QUEUE_MOUNT_PATH}`;
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
