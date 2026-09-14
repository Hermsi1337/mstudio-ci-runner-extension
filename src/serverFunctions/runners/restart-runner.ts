import { createServerFn } from "@tanstack/react-start";
import { restartRunner } from "@/domain/runner.ts";
import { zRunnerIdRequest } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const restartRunnerServerFunction = createServerFn({ method: "POST" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .inputValidator(zRunnerIdRequest)
    .handler(
        async ({ context: { mittwaldClient, extensionInstanceId }, data }) =>
            restartRunner(mittwaldClient, extensionInstanceId, data.runnerId),
    );
