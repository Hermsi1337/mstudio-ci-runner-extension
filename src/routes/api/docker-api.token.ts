import { createFileRoute } from "@tanstack/react-router";
import { bearerToken } from "@/docker-api.ts";
import {
    DockerApiTokenDenied,
    DockerApiTokenUnavailable,
    issueDockerApiToken,
} from "@/domain/docker-api.ts";
import {
    zDockerApiTokenRequest,
    zDockerApiTokenResponse,
} from "@/generated/extension-api/zod.gen.ts";
import {
    addLogContext,
    createLogger,
    newRequestId,
    withLogContext,
} from "@/logger.ts";

const log = createLogger("docker-api");

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * Called by the service `docker` of a stack, not by the UI (see
 * issueDockerApiToken). Answers without detail on refusal, the adapter logs
 * the status.
 */
export const Route = createFileRoute("/api/docker-api/token")({
    server: {
        handlers: {
            POST: ({ request }) =>
                withLogContext({ requestId: newRequestId() }, async () => {
                    const secret = bearerToken(
                        request.headers.get("authorization"),
                    );
                    const body = zDockerApiTokenRequest.safeParse(
                        await request.json().catch(() => undefined),
                    );
                    if (!body.success) {
                        return json(400, { message: "invalid body" });
                    }
                    addLogContext({ stackId: body.data.stackId });
                    if (!secret) {
                        return json(401, { message: "unauthorized" });
                    }
                    try {
                        const token = await issueDockerApiToken(
                            body.data.stackId,
                            secret,
                        );
                        return json(200, zDockerApiTokenResponse.parse(token));
                    } catch (error) {
                        if (error instanceof DockerApiTokenDenied) {
                            return json(401, { message: "unauthorized" });
                        }
                        if (error instanceof DockerApiTokenUnavailable) {
                            return json(502, { message: "no token" });
                        }
                        log.error("docker api token failed", { error });
                        return json(500, { message: "internal error" });
                    }
                }),
        },
    },
});
