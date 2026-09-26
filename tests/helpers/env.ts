/**
 * Defaults only fill unset variables, overrides always win. Must run before any
 * module that reads the environment at import time, such as the DB schema.
 */
export function setTestEnvironment(overrides: Record<string, string>): void {
    const defaults: Record<string, string> = {
        POSTGRES_USER: "test",
        POSTGRES_PASSWORD: "test",
        POSTGRES_DB: "test",
        POSTGRES_HOST: "localhost",
        POSTGRES_PORT: "5432",
        EXTENSION_ID: "00000000-0000-0000-0000-00000000ext1",
        EXTENSION_SECRET: "test-extension-secret",
        ENCRYPTION_MASTER_PASSWORD: "test-master-password",
        ENCRYPTION_SALT: "test-salt",
        RUN_MIGRATIONS_ON_STARTUP: "false",
        RUNNER_IMAGE_GITHUB: "ghcr.io/hermsi1337/mstudio-ci-runner-github:test",
        RUNNER_IMAGE_GITLAB: "ghcr.io/hermsi1337/mstudio-ci-runner-gitlab:test",
        RUNNER_IMAGE_FORGEJO:
            "ghcr.io/hermsi1337/mstudio-ci-runner-forgejo:test",
    };
    for (const [key, value] of Object.entries(defaults)) {
        process.env[key] ??= value;
    }
    for (const [key, value] of Object.entries(overrides)) {
        process.env[key] = value;
    }
}
