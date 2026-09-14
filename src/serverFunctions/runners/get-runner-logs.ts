import { createServerFn } from "@tanstack/react-start";
import { getRunnerLogs } from "@/domain/runner.ts";
import { zRunnerLogsRequest } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const getRunnerLogsServerFunction = createServerFn({ method: "GET" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .validator(zRunnerLogsRequest)
    .handler(
        async ({ context: { mittwaldClient, extensionInstanceId }, data }) =>
            getRunnerLogs(
                mittwaldClient,
                extensionInstanceId,
                data.runnerId,
                data.tail,
            ),
    );
