import { createServerFn } from "@tanstack/react-start";
import { configureRunner } from "@/domain/runner.ts";
import {
    zConfigureRunnerRequest,
    zRunner,
} from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const configureRunnerServerFunction = createServerFn({ method: "POST" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .inputValidator(zConfigureRunnerRequest)
    .handler(
        async ({ context: { mittwaldClient, extensionInstanceId }, data }) =>
            zRunner.parse(
                await configureRunner(
                    mittwaldClient,
                    extensionInstanceId,
                    data,
                ),
            ),
    );
