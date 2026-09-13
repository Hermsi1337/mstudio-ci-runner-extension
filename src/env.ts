import { bool, cleanEnv, num, str, url } from "envalid";

export const getEnvironmentVariables = () =>
    cleanEnv(process.env, {
        PORT: num({ default: 3000 }),
        POSTGRES_USER: str(),
        POSTGRES_PASSWORD: str(),
        POSTGRES_DB: str(),
        POSTGRES_HOST: str(),
        POSTGRES_PORT: num(),
        POSTGRES_USE_SSL: bool({ default: false }),
        EXTENSION_ID: str(),
        EXTENSION_SECRET: str(),
        ZROK_RESERVED_TOKEN: str({ default: undefined }),
        ENCRYPTION_MASTER_PASSWORD: str(),
        ENCRYPTION_SALT: str(),
        RUN_MIGRATIONS_ON_STARTUP: bool({ default: true }),
        RUNNER_IMAGE_GITHUB: str({
            default: "ghcr.io/hermsi1337/mstudio-ci-runner-github:latest",
        }),
        RUNNER_IMAGE_GITLAB: str({
            default: "ghcr.io/hermsi1337/mstudio-ci-runner-gitlab:latest",
        }),
        MITTWALD_API_URL: url({ default: "https://api.mittwald.de/" }),
        GITHUB_API_URL: url({ default: "https://api.github.com" }),
        GITLAB_API_URL: url({ default: undefined }),
    });
