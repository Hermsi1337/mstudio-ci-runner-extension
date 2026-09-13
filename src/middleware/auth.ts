import { getSessionToken } from "@mittwald/ext-bridge/browser";
import { getAccessToken, verify } from "@mittwald/ext-bridge/node";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { detectBrowserLocale } from "@/i18n/react.tsx";
import { isLocalModeEnabled, localModeHeader } from "@/local-mode.ts";
import { createMittwaldClient } from "@/mittwald/client.ts";
import { getEnvironmentVariables } from "../env";
import { localModeContext } from "./local-mode.ts";
import { localeHeader } from "./locale.ts";

type VerifiedSessionToken = Awaited<ReturnType<typeof verify>>;

const sessionTokenHeader = "x-session-token";

async function requestHeaders() {
    const headers: Record<string, string> = {
        [localeHeader]: detectBrowserLocale(),
    };
    if (isLocalModeEnabled()) {
        headers[localModeHeader] = "1";
    } else {
        headers[sessionTokenHeader] = await getSessionToken();
    }
    return { headers };
}

function isLocalModeRequest() {
    return getRequestHeader(localModeHeader) === "1";
}

async function getVerifiedSessionToken(): Promise<
    [VerifiedSessionToken, string]
> {
    const sessionToken = getRequestHeader(sessionTokenHeader);
    if (!sessionToken) {
        throw new Error("No session token found");
    }
    const verifiedSessionToken = await verify(sessionToken);
    return [verifiedSessionToken, sessionToken];
}

export const authenticationMiddlewareWithSessionVerification = createMiddleware(
    { type: "function" },
)
    .client(async ({ next }) => next(await requestHeaders()))
    .server(async ({ next }) => {
        if (isLocalModeRequest()) {
            const { contextId, extensionInstanceId, userId } =
                await localModeContext();
            return next({
                context: { contextId, extensionInstanceId, userId },
            });
        }
        const [verifiedSessionToken] = await getVerifiedSessionToken();
        return next({
            context: {
                contextId: verifiedSessionToken.contextId,
                extensionInstanceId: verifiedSessionToken.extensionInstanceId,
                userId: verifiedSessionToken.userId,
            },
        });
    });

export const authenticationMiddlewareWithAccessToken = createMiddleware({
    type: "function",
})
    .client(async ({ next }) => next(await requestHeaders()))
    .server(async ({ next }) => {
        if (isLocalModeRequest()) {
            return next({ context: await localModeContext() });
        }

        const [verifiedSessionToken, sessionToken] =
            await getVerifiedSessionToken();

        const env = getEnvironmentVariables();
        const extensionSecret = env.EXTENSION_SECRET;

        const accessToken = await getAccessToken(sessionToken, extensionSecret);
        const mittwaldClient = createMittwaldClient(accessToken.publicToken);

        return next({
            context: {
                contextId: verifiedSessionToken.contextId,
                extensionInstanceId: verifiedSessionToken.extensionInstanceId,
                userId: verifiedSessionToken.userId,
                accessToken: accessToken.publicToken,
                mittwaldClient,
            },
        });
    });
