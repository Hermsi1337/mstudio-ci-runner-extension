import { definePlugin } from "nitro";
import { runMigrations } from "../../db/migrate";
import { getEnvironmentVariables } from "../../env";

export default definePlugin(async () => {
    const env = getEnvironmentVariables();

    if (!env.RUN_MIGRATIONS_ON_STARTUP) {
        console.log(
            "[migrations] Skipping migrations (RUN_MIGRATIONS_ON_STARTUP=false)",
        );
        return;
    }

    const result = await runMigrations();

    if (!result.success) {
        console.error(result.error);
        process.exit(1);
    }
});
