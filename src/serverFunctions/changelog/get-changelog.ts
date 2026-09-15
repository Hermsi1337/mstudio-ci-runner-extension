import { createServerFn } from "@tanstack/react-start";
import { getChangelog } from "@/domain/changelog.ts";
import { zChangelog } from "@/generated/extension-api/zod.gen";
import { authenticationMiddlewareWithSessionVerification } from "@/middleware/auth.ts";

export const getChangelogServerFunction = createServerFn({ method: "GET" })
    .middleware([authenticationMiddlewareWithSessionVerification])
    .handler(async () => zChangelog.parse(await getChangelog()));
