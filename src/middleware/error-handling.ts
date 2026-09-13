import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { ZodIssue } from "zod/v3";
import { type ErrorBody, PublicError } from "@/global-errors";
import { resolveLocale, translate } from "@/i18n/index.ts";
import { createLogger, newRequestId, withLogContext } from "@/logger.ts";
import { localeHeader } from "./locale.ts";

const log = createLogger("server-function");

/**
 * In development the function id is base64 JSON with the export name; production
 * builds use an opaque hash, of which a prefix is enough to group lines.
 */
function functionName(functionId: string): string {
    try {
        const decoded = JSON.parse(
            Buffer.from(functionId, "base64").toString("utf8"),
        );
        if (typeof decoded.export === "string") {
            return decoded.export.replace(/_createServerFn_handler$/, "");
        }
    } catch {}
    return functionId.slice(0, 12);
}

export const handleServerErrors = createMiddleware({
    type: "function",
}).server(({ next, functionId, method }) =>
    withLogContext(
        { requestId: newRequestId(), fn: functionName(functionId) },
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
                throw toErrorResponse(error);
            }
        },
    ),
);

function toErrorResponse(error: unknown): Response {
    const locale = resolveLocale(
        getRequestHeader(localeHeader) ?? getRequestHeader("accept-language"),
    );

    const validationIssues = parseZodValidationError(error);
    if (validationIssues) {
        log.warn("request rejected by validation", {
            issues: validationIssues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            ),
        });
        return buildValidationError(validationIssues);
    }

    if (error instanceof PublicError) {
        log.warn("request failed", {
            type: error.name,
            messageKey: error.messageKey,
            params: error.params,
            status: error.statusCode,
        });
        return buildPublicError(error, locale);
    }

    log.error("unexpected error in server function", { error });
    return buildUnknownError(locale);
}

function parseZodValidationError(error: unknown): ZodIssue[] | null {
    if (!(error instanceof Error)) {
        return null;
    }

    try {
        const parsed = JSON.parse(error.message.trim());
        const isValid =
            Array.isArray(parsed) &&
            parsed.length > 0 &&
            parsed.every(
                (item) =>
                    typeof item === "object" &&
                    item !== null &&
                    "message" in item &&
                    "path" in item &&
                    Array.isArray(item.path),
            );

        return isValid ? (parsed as ZodIssue[]) : null;
    } catch {
        return null;
    }
}

function buildValidationError(validationIssues: ZodIssue[]): Response {
    const firstIssue = validationIssues[0];

    return Response.json(
        {
            type: "ValidationError",
            message: firstIssue.message,
            isRetryable: false,
            details: {
                affectedField: String(firstIssue.path[0]),
            },
        } satisfies ErrorBody,
        { status: 400 },
    );
}

function buildPublicError(
    error: PublicError,
    locale: ReturnType<typeof resolveLocale>,
): Response {
    return Response.json(
        {
            type: error.name,
            message: translate(locale, error.messageKey, error.params),
            isRetryable: error.isRetryable,
            details: error.details ?? {},
        } satisfies ErrorBody,
        { status: error.statusCode },
    );
}

function buildUnknownError(locale: ReturnType<typeof resolveLocale>): Response {
    return Response.json(
        {
            type: "UnknownError",
            message: translate(locale, "error.unexpected"),
            isRetryable: false,
            details: {},
        } satisfies ErrorBody,
        { status: 500 },
    );
}
