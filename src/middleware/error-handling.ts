import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { resolveLocale } from "@/i18n/index.ts";
import { createLogger, newRequestId, withLogContext } from "@/logger.ts";
import {
    type ClassifiedError,
    classifyError,
    toErrorBody,
} from "./error-body.ts";
import { localeHeader } from "./locale.ts";

/**
 * Registered globally in src/start.ts, so this module is imported by the
 * client bundle too. TanStack Start strips the .server() callback there, and
 * Rollup drops the logger with it as long as nothing else in this module is
 * exported. Keep every other export out of this file; pure helpers live in
 * error-body.ts. scripts/check-client-bundle.sh fails the build otherwise.
 */
const log = createLogger("server-function");

export const handleServerErrors = createMiddleware({
    type: "function",
}).server(({ next, serverFnMeta, method }) =>
    withLogContext(
        { requestId: newRequestId(), fn: serverFnMeta.name },
        async () => {
            const started = Date.now();
            log.debug("request started", { method });
            try {
                const result = await next();
                log.debug("request completed", {
                    durationMs: Date.now() - started,
                });
                return result;
            } catch (error) {
                const classified = classifyError(error);
                logFailure(classified);
                const locale = resolveLocale(
                    getRequestHeader(localeHeader) ??
                        getRequestHeader("accept-language"),
                );
                // A serializable Error whose message is the JSON error body:
                // the client rejects the call and parsePublicError reads the
                // body from the message. A thrown Response resolves the call
                // with undefined since TanStack Start 1.17x.
                throw new Error(
                    JSON.stringify(toErrorBody(classified, locale)),
                );
            }
        },
    ),
);

function logFailure(classified: ClassifiedError): void {
    switch (classified.kind) {
        case "validation":
            log.warn("request rejected by validation", {
                issues: classified.issues.map(
                    (issue) => `${issue.path.join(".")}: ${issue.message}`,
                ),
            });
            return;
        case "public":
            log.warn("request failed", {
                type: classified.error.name,
                messageKey: classified.error.messageKey,
                params: classified.error.params,
                status: classified.error.statusCode,
            });
            return;
        case "unknown":
            log.error("unexpected error in server function", {
                error: classified.error,
            });
    }
}
