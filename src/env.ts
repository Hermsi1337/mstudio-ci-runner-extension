import { bool, cleanEnv, num, str, url } from "envalid";
import packageJson from "../package.json";

const RUNNER_IMAGE_REPOSITORY = "ghcr.io/hermsi1337/mstudio-ci-runner";
const BUILDER_IMAGE_REPOSITORY = "ghcr.io/hermsi1337/mstudio-ci-builder";
const DOCKER_API_IMAGE_REPOSITORY = "ghcr.io/hermsi1337/mstudio-ci-docker-api";

export const getEnvironmentVariables = () => {
    const extensionVersion =
        process.env.EXTENSION_VERSION || packageJson.version;
    // The stack file renders an unset GitHub variable as an empty string.
    const source = { ...process.env };
    if (!source.PUBLIC_URL) {
        delete source.PUBLIC_URL;
    }
    return cleanEnv(source, {
        PORT: num({ default: 3000 }),
        POSTGRES_USER: str(),
        POSTGRES_PASSWORD: str(),
        POSTGRES_DB: str(),
        POSTGRES_HOST: str(),
        POSTGRES_PORT: num(),
        POSTGRES_USE_SSL: bool({ default: false }),
        EXTENSION_ID: str(),
        EXTENSION_SECRET: str(),
        ZROK_SHARE_NAME: str({ default: undefined }),
        ENCRYPTION_MASTER_PASSWORD: str(),
        ENCRYPTION_SALT: str(),
        RUN_MIGRATIONS_ON_STARTUP: bool({ default: true }),
        EXTENSION_VERSION: str({ default: extensionVersion }),
        RUNNER_IMAGE_GITHUB: str({
            default: `${RUNNER_IMAGE_REPOSITORY}-github:${extensionVersion}`,
        }),
        RUNNER_IMAGE_GITLAB: str({
            default: `${RUNNER_IMAGE_REPOSITORY}-gitlab:${extensionVersion}`,
        }),
        BUILDER_IMAGE: str({
            default: `${BUILDER_IMAGE_REPOSITORY}:${extensionVersion}`,
        }),
        DOCKER_API_IMAGE: str({
            default: `${DOCKER_API_IMAGE_REPOSITORY}:${extensionVersion}`,
        }),
        // Where the service `docker` of a stack reaches this extension for its
        // tokens. Without it the option "Docker in jobs" is refused.
        PUBLIC_URL: url({ default: undefined }),
        MITTWALD_API_URL: url({ default: "https://api.mittwald.de/" }),
        GITHUB_API_URL: url({ default: "https://api.github.com" }),
        GITLAB_API_URL: url({ default: undefined }),
        LOG_LEVEL: str({
            choices: ["debug", "info", "warn", "error"],
            default: "info",
        }),
        LOG_FORMAT: str({
            choices: ["json", "text"],
            default: process.env.NODE_ENV === "production" ? "json" : "text",
        }),
    });
};
