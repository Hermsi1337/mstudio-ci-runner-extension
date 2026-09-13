import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { ZodIssue } from "zod/v3";
import { type ErrorBody, PublicError } from "@/global-errors";
import { resolveLocale, translate } from "@/i18n/index.ts";
import { createLogger } from "@/logger.ts";
import { localeHeader } from "./locale.ts";

const log = createLogger("server-function");

export const handleServerErrors = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    try {
        return await next();
    } catch (error) {
        const locale = resolveLocale(
            getRequestHeader(localeHeader) ??
                getRequestHeader("accept-language"),
        );

        const validationIssues = parseZodValidationError(error);
        if (validationIssues) {
            log.warn("request rejected by validation", {
                issues: validationIssues.map(
                    (issue) => `${issue.path.join(".")}: ${issue.message}`,
                ),
            });
            throw buildValidationError(validationIssues);
        }

        if (error instanceof PublicError) {
            log.warn("request failed", {
                type: error.name,
                messageKey: error.messageKey,
                params: error.params,
                status: error.statusCode,
            });
            throw buildPublicError(error, locale);
        }

        log.error("unexpected error in server function", { error });
        throw buildUnknownError(locale);
    }
});

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
