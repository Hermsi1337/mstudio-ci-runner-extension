import type { ZodIssue } from "zod/v3";
import { type ErrorBody, PublicError } from "@/global-errors";
import { type Locale, translate } from "@/i18n/index.ts";

/**
 * Pure half of the server function error handling: turns a thrown value into
 * the error body the client parses. No logging and no imports of server-only
 * modules, because the middleware that uses it is registered in
 * src/start.ts and therefore part of the client bundle. The unit test in
 * error-handling.test.ts pins the contract with parsePublicError.
 */
export type ClassifiedError =
    | { kind: "validation"; issues: ZodIssue[] }
    | { kind: "public"; error: PublicError }
    | { kind: "unknown"; error: unknown };

export function classifyError(error: unknown): ClassifiedError {
    const issues = parseZodValidationError(error);
    if (issues) {
        return { kind: "validation", issues };
    }
    if (error instanceof PublicError) {
        return { kind: "public", error };
    }
    return { kind: "unknown", error };
}

export function toErrorBody(
    classified: ClassifiedError,
    locale: Locale,
): ErrorBody {
    switch (classified.kind) {
        case "validation":
            return buildValidationError(classified.issues);
        case "public":
            return buildPublicError(classified.error, locale);
        case "unknown":
            return buildUnknownError(locale);
    }
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

function buildValidationError(validationIssues: ZodIssue[]): ErrorBody {
    const firstIssue = validationIssues[0];

    return {
        type: "ValidationError",
        message: firstIssue.message,
        isRetryable: false,
        details: {
            affectedField: String(firstIssue.path[0]),
        },
    };
}

function buildPublicError(error: PublicError, locale: Locale): ErrorBody {
    return {
        type: error.name,
        message: translate(locale, error.messageKey, error.params),
        isRetryable: error.isRetryable,
        details: error.details ?? {},
    };
}

function buildUnknownError(locale: Locale): ErrorBody {
    return {
        type: "UnknownError",
        message: translate(locale, "error.unexpected"),
        isRetryable: false,
        details: {},
    };
}
