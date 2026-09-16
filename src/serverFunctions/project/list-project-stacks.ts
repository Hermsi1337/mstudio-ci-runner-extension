import { createServerFn } from "@tanstack/react-start";
import { listProjectStacks } from "@/domain/stack.ts";
import { zProjectStackList } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const listProjectStacksServerFunction = createServerFn({ method: "GET" })
    .middleware([authenticationMiddlewareWithAccessToken])
    .handler(
        async ({
            context: { mittwaldClient, extensionInstanceId, contextId },
        }) =>
            zProjectStackList.parse(
                await listProjectStacks(
                    mittwaldClient,
                    extensionInstanceId,
                    contextId,
                ),
            ),
    );
