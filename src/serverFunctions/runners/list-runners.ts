import { createServerFn } from "@tanstack/react-start";
import { listRunners } from "@/domain/runner.ts";
import { zRunnerList } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const listRunnersServerFunction = createServerFn({ method: "GET" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .handler(async ({ context: { mittwaldClient, extensionInstanceId } }) =>
        zRunnerList.parse(
            await listRunners(mittwaldClient, extensionInstanceId),
        ),
    );
