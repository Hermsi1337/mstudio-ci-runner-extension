import { createServerFn } from "@tanstack/react-start";
import { deleteRunner } from "@/domain/runner.ts";
import { zRunnerIdRequest } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const deleteRunnerServerFunction = createServerFn({ method: "POST" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .validator(zRunnerIdRequest)
    .handler(
        async ({ context: { mittwaldClient, extensionInstanceId }, data }) =>
            deleteRunner(mittwaldClient, extensionInstanceId, data.runnerId),
    );
