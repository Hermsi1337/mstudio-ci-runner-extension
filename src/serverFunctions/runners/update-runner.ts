import { createServerFn } from "@tanstack/react-start";
import { updateRunner } from "@/domain/runner.ts";
import { zRunner, zRunnerIdRequest } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const updateRunnerServerFunction = createServerFn({ method: "POST" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .validator(zRunnerIdRequest)
    .handler(
        async ({ context: { mittwaldClient, extensionInstanceId }, data }) =>
            zRunner.parse(
                await updateRunner(
                    mittwaldClient,
                    extensionInstanceId,
                    data.runnerId,
                ),
            ),
    );
