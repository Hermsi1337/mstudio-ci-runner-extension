import { getDatabase } from "@/db";
import { extensionInstances } from "@/db/schema.ts";
import { addLogContext, createLogger } from "@/logger.ts";
import { createMittwaldClient } from "@/mittwald/client.ts";
import { getEnvironmentVariables } from "../env";

const localUserId = "local";
const log = createLogger("auth");

export async function localModeContext() {
    const env = getEnvironmentVariables();
    if (env.isProduction || !env.LOCAL_API_TOKEN || !env.LOCAL_PROJECT_ID) {
        throw new Error(
            "Local mode needs LOCAL_API_TOKEN and LOCAL_PROJECT_ID and is disabled in production",
        );
    }

    await getDatabase()
        .insert(extensionInstances)
        .values({
            id: env.LOCAL_PROJECT_ID,
            contextId: env.LOCAL_PROJECT_ID,
            context: "project",
            active: true,
            consentedScopes: [
                "project:read",
                "stack:read",
                "stack:write",
                "stack:delete",
            ],
            secret: localUserId,
        })
        .onConflictDoNothing();

    addLogContext({
        userId: localUserId,
        contextId: env.LOCAL_PROJECT_ID,
        extensionInstanceId: env.LOCAL_PROJECT_ID,
    });
    log.debug("request authenticated in local mode");

    return {
        contextId: env.LOCAL_PROJECT_ID,
        extensionInstanceId: env.LOCAL_PROJECT_ID,
        userId: localUserId,
        accessToken: env.LOCAL_API_TOKEN,
        mittwaldClient: createMittwaldClient(env.LOCAL_API_TOKEN),
    };
}
