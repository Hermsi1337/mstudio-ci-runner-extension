import { createFileRoute } from "@tanstack/react-router";
import { CombinedWebhookHandlerFactory } from "@weissaufschwarz/mitthooks/factory/combined";
import type { WebhookHandler } from "@weissaufschwarz/mitthooks/handler/interface";
import { HttpWebhookHandler } from "@weissaufschwarz/mitthooks/index";
import { PgExtensionStorage } from "@weissaufschwarz/mitthooks-drizzle/index";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { extensionInstances, runners } from "@/db/schema.ts";
import { deleteAllRunnersOfInstance } from "@/domain/runner.ts";
import { getEnvironmentVariables } from "@/env.ts";
import { createLogger } from "@/logger.ts";
import { createMittwaldClient } from "@/mittwald/client.ts";

const db = getDatabase();
const log = createLogger("webhook");

/**
 * Runs before the default handler chain so the instance secret is still
 * available to obtain an API token for deleting the runner stacks.
 */
const cleanupRunnersOnRemoval: WebhookHandler = {
    async handleWebhook(content, next) {
        let body: { kind?: string; id?: string } = {};
        try {
            body = JSON.parse(content.rawBody);
        } catch {
            body = {};
        }

        log.info("webhook received", { kind: body.kind, instanceId: body.id });
        if (body.kind !== "InstanceRemovedFromContext" || !body.id) {
            return next(content);
        }

        const extensionInstanceId = body.id;
        const [instance] = await db
            .select()
            .from(extensionInstances)
            .where(eq(extensionInstances.id, extensionInstanceId));
        const rows = await db
            .select()
            .from(runners)
            .where(eq(runners.extensionInstanceId, extensionInstanceId));

        await next(content);

        if (!instance?.secret || rows.length === 0) {
            log.debug("no runner cleanup needed", {
                instanceId: extensionInstanceId,
                runners: rows.length,
                hasSecret: Boolean(instance?.secret),
            });
            return;
        }
        const instanceSecret = instance.secret;

        // mStudio expects an answer within 6 seconds, so cleanup runs detached.
        void (async () => {
            try {
                const auth =
                    await createMittwaldClient().marketplace.extensionAuthenticateInstance(
                        {
                            extensionInstanceId,
                            data: { extensionInstanceSecret: instanceSecret },
                        },
                    );
                if (auth.status !== 201) {
                    log.error("instance authentication for cleanup failed", {
                        instanceId: extensionInstanceId,
                        status: auth.status,
                    });
                    return;
                }
                const client = createMittwaldClient(auth.data.publicToken);
                await deleteAllRunnersOfInstance(client, rows);
                log.info("runner stacks of removed instance deleted", {
                    instanceId: extensionInstanceId,
                    runners: rows.length,
                });
            } catch (error) {
                log.error("instance cleanup failed", {
                    instanceId: extensionInstanceId,
                    error,
                });
            }
        })();
    },
};

export const Route = createFileRoute("/api/webhooks/mittwald")({
    server: {
        handlers: {
            POST: async ({ request }) => {
                const env = getEnvironmentVariables();

                const combinedHandler = new CombinedWebhookHandlerFactory(
                    new PgExtensionStorage(db, extensionInstances),
                    env.EXTENSION_ID,
                )
                    .withMittwaldAPIURL(env.MITTWALD_API_URL)
                    .withWebhookHandlerPrefix(cleanupRunnersOnRemoval)
                    .build();

                const httpHandler = new HttpWebhookHandler(combinedHandler);
                return httpHandler.handleWebhook(request);
            },
        },
    },
});
