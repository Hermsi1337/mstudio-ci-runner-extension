import { definePlugin } from "nitro";
import { runMigrations } from "../../db/migrate";
import { getEnvironmentVariables } from "../../env";
import { createLogger } from "../../logger";

const log = createLogger("startup");

export default definePlugin(async () => {
    const env = getEnvironmentVariables();

    log.info("extension starting", {
        logLevel: env.LOG_LEVEL,
        mittwaldApiUrl: env.MITTWALD_API_URL,
        runnerImageGithub: env.RUNNER_IMAGE_GITHUB,
        runnerImageGitlab: env.RUNNER_IMAGE_GITLAB,
        localMode: Boolean(env.LOCAL_API_TOKEN && env.LOCAL_PROJECT_ID),
    });

    if (!env.RUN_MIGRATIONS_ON_STARTUP) {
        log.info("skipping migrations, RUN_MIGRATIONS_ON_STARTUP=false");
        return;
    }

    const result = await runMigrations();

    if (!result.success) {
        log.error("migrations failed, exiting", { error: result.error });
        process.exit(1);
    }
});
