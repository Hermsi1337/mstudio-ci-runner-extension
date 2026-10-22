import { execFileSync } from "node:child_process";
import {
    GenericContainer,
    getContainerRuntimeClient,
    ImageName,
} from "testcontainers";

export type RepositoryImage = "github" | "gitlab" | "forgejo" | "builder";

const sources: Record<
    RepositoryImage,
    { tag: string; context: string; dockerfile: string }
> = {
    github: {
        tag: "mstudio-ci-runner-github:test",
        context: "docker/runner",
        dockerfile: "github/Dockerfile",
    },
    gitlab: {
        tag: "mstudio-ci-runner-gitlab:test",
        context: "docker/runner",
        dockerfile: "gitlab/Dockerfile",
    },
    forgejo: {
        tag: "mstudio-ci-runner-forgejo:test",
        context: "docker/runner",
        dockerfile: "forgejo/Dockerfile",
    },
    builder: {
        tag: "mstudio-ci-builder:test",
        context: "docker/builder",
        dockerfile: "Dockerfile",
    },
};

export function repositoryImageTag(image: RepositoryImage): string {
    return sources[image].tag;
}

function buildArgs(image: RepositoryImage): Record<string, string> {
    const output = execFileSync("scripts/image-build-args.sh", [image], {
        encoding: "utf8",
    });
    return Object.fromEntries(
        output
            .trim()
            .split("\n")
            .map((line) => {
                const separator = line.indexOf("=");
                return [line.slice(0, separator), line.slice(separator + 1)];
            }),
    );
}

/**
 * Builds an image from docker/ under its test tag and returns the tag. CI builds
 * the images beforehand with a layer cache and sets PREBUILT_IMAGES=1
 * (docs/testing.md), then the tag only has to exist.
 */
export async function provideRepositoryImage(
    image: RepositoryImage,
): Promise<string> {
    const { tag, context, dockerfile } = sources[image];
    if (process.env.PREBUILT_IMAGES === "1") {
        const client = await getContainerRuntimeClient();
        if (!(await client.image.exists(ImageName.fromString(tag)))) {
            throw new Error(
                `PREBUILT_IMAGES=1 but ${tag} does not exist, build it with scripts/build-runner-images.sh test`,
            );
        }
        return tag;
    }
    await GenericContainer.fromDockerfile(context, dockerfile)
        .withBuildkit()
        .withBuildArgs(buildArgs(image))
        .build(tag, { deleteOnExit: false });
    return tag;
}
