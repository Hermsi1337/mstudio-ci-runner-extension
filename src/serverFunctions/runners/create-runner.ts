import { createServerFn } from "@tanstack/react-start";
import { createRunner } from "@/domain/runner.ts";
import {
    zCreateRunnerRequest,
    zRunner,
} from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const createRunnerServerFunction = createServerFn({ method: "POST" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .inputValidator(zCreateRunnerRequest)
    .handler(
        async ({
            context: { mittwaldClient, extensionInstanceId, contextId, userId },
            data,
        }) =>
            zRunner.parse(
                await createRunner(
                    mittwaldClient,
                    extensionInstanceId,
                    contextId,
                    userId,
                    data,
                ),
            ),
    );
