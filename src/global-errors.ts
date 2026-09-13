import { z } from "zod/v4";

const errorDetailsSchema = z
    .object({
        extensionInstanceId: z.string().optional(),
        affectedField: z.string().optional(),
    })
    .catchall(z.string().optional());

export type PublicErrorDetails = z.infer<typeof errorDetailsSchema>;

export const errorBodySchema = z.object({
    type: z.string(),
    message: z.string(),
    isRetryable: z.boolean(),
    details: errorDetailsSchema,
});

export abstract class PublicError extends Error {
    public readonly isRetryable: boolean;
    public readonly statusCode: number;
    public readonly cause?: Error;
    public readonly details?: PublicErrorDetails;

    protected constructor(
        message: string,
        isRetryable: boolean = false,
        statusCode: number = 500,
        cause?: Error,
        details?: PublicErrorDetails,
    ) {
        super(message);
        this.name = this.constructor.name;
        this.isRetryable = isRetryable;
        this.statusCode = statusCode;
        this.cause = cause;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

export type ErrorBody = z.infer<typeof errorBodySchema>;

export function parsePublicError(err: unknown): ErrorBody | undefined {
    const parsedError = errorBodySchema.safeParse(err);
    if (parsedError.success) {
        return parsedError.data;
    }
    if (!(err instanceof Error)) {
        return undefined;
    }
    try {
        const parsedMessage = errorBodySchema.safeParse(
            JSON.parse(err.message),
        );
        if (parsedMessage.success) {
            return parsedMessage.data;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

export class PermissionsInsufficientError extends PublicError {
    public constructor(extensionInstanceId: string) {
        super(
            "Insufficient permissions. Either you cannot manage containers in this project or the extension lacks a scope (stack:read, stack:write, stack:delete).",
            false,
            403,
            undefined,
            { extensionInstanceId },
        );
    }
}

export class NotFoundError extends PublicError {
    public constructor(what: string) {
        super(`${what} was not found.`, false, 404);
    }
}

export class ProviderError extends PublicError {
    public constructor(message: string, affectedField?: string) {
        super(message, false, 400, undefined, { affectedField });
    }
}

export class UpstreamError extends PublicError {
    public constructor(message: string, cause?: Error) {
        super(message, true, 502, cause);
    }
}
