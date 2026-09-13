import { createMiddleware } from "@tanstack/react-start";
import type { ZodIssue } from "zod/v3";
import { type ErrorBody, PublicError } from "@/global-errors";

export const handleServerErrors = createMiddleware({
    type: "function",
}).server(async ({ next }) => {
    try {
        return await next();
    } catch (error) {
        console.error("Server function error occured:", error);

        const validationIssues = parseZodValidationError(error);
        if (validationIssues) {
            throw buildValidationError(validationIssues);
        }

        if (error instanceof PublicError) {
            throw buildPublicError(error);
        }

        throw buildUnknownError();
    }
});

function parseZodValidationError(error: unknown): ZodIssue[] | null {
    if (!(error instanceof Error)) {
        return null;
    }

    const trimmed = error.message.trim();

    try {
        const parsed = JSON.parse(trimmed);
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
    console.log(`error is a validation error`);
    const firstIssue = validationIssues[0];

    return Response.json(
        {
            type: "ValidationError",
            message: firstIssue.message,
            isRetryable: false,
            details: {
                affectedField: firstIssue.path[0],
            },
        },
        {
            status: 400,
        },
    );
}

function buildPublicError(error: PublicError): Response {
    console.log(`error is known, responding with ${error.statusCode}`);
    return Response.json(
        {
            type: error.name,
            message: error.message,
            isRetryable: error.isRetryable,
            details: error.details,
        } as ErrorBody,
        {
            status: error.statusCode,
        },
    );
}

function buildUnknownError(): Response {
    console.log("error is unknown, responding with status 500");
    return Response.json(
        {
            type: "UnknownError",
            message: "An unexpected error occurred",
            isRetryable: false,
        },
        { status: 500 },
    );
}
