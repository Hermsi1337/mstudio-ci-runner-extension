import { createServerFn } from "@tanstack/react-start";
import { getProjectCapabilities } from "@/domain/project.ts";
import { zProjectCapabilities } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithAccessToken } from "@/middleware/auth.ts";

export const getProjectCapabilitiesServerFunction = createServerFn({
    method: "GET",
})
    .middleware([authenticationMiddlewareWithAccessToken])
    .handler(async ({ context: { mittwaldClient, contextId } }) =>
        zProjectCapabilities.parse(
            await getProjectCapabilities(mittwaldClient, contextId),
        ),
    );
