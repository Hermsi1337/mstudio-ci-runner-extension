import { z } from "zod/v4";
import type { MessageKey, MessageParams } from "@/i18n/index.ts";

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

export type ErrorBody = z.infer<typeof errorBodySchema>;

/**
 * Carries a message key instead of a text so the error middleware can render
 * it in the language of the request.
 */
export abstract class PublicError extends Error {
    public readonly messageKey: MessageKey;
    public readonly params: MessageParams;
    public readonly isRetryable: boolean;
    public readonly statusCode: number;
    public readonly details?: PublicErrorDetails;

    protected constructor(
        messageKey: MessageKey,
        params: MessageParams = {},
        options: {
            isRetryable?: boolean;
            statusCode?: number;
            details?: PublicErrorDetails;
        } = {},
    ) {
        super(messageKey);
        this.name = this.constructor.name;
        this.messageKey = messageKey;
        this.params = params;
        this.isRetryable = options.isRetryable ?? false;
        this.statusCode = options.statusCode ?? 500;
        this.details = options.details;
        Error.captureStackTrace(this, this.constructor);
    }
}

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
            "error.permissions",
            {},
            { statusCode: 403, details: { extensionInstanceId } },
        );
    }
}

export class ContainerHostingUnavailableError extends PublicError {
    public constructor(projectId: string) {
        super(
            "error.containerHosting.unavailable",
            {},
            { statusCode: 409, details: { projectId } },
        );
    }
}

export class BuilderNameTakenError extends PublicError {
    public constructor(stackId: string) {
        super(
            "error.builder.nameTaken",
            {},
            { statusCode: 409, details: { stackId } },
        );
    }
}

export class DockerApiNameTakenError extends PublicError {
    public constructor(stackId: string) {
        super(
            "error.dockerApi.nameTaken",
            {},
            { statusCode: 409, details: { stackId } },
        );
    }
}

/** The service `docker` needs a public URL of the extension to get tokens. */
export class DockerApiUnconfiguredError extends PublicError {
    public constructor() {
        super("error.dockerApi.unconfigured", {}, { statusCode: 409 });
    }
}

const notFoundMessageKeys = {
    runner: "error.notFound.runner",
    runnerContainer: "error.notFound.runnerContainer",
    stack: "error.notFound.stack",
} as const satisfies Record<string, MessageKey>;

export class NotFoundError extends PublicError {
    public constructor(what: keyof typeof notFoundMessageKeys) {
        super(notFoundMessageKeys[what], {}, { statusCode: 404 });
    }
}

export class UnknownInstanceError extends PublicError {
    public constructor(extensionInstanceId: string) {
        super(
            "error.instance.unknown",
            {},
            { statusCode: 409, details: { extensionInstanceId } },
        );
    }
}

export class ProviderError extends PublicError {
    public constructor(
        messageKey: MessageKey,
        params: MessageParams = {},
        affectedField?: string,
    ) {
        super(messageKey, params, {
            statusCode: 400,
            details: { affectedField },
        });
    }
}

export class UpstreamError extends PublicError {
    public constructor(messageKey: MessageKey, params: MessageParams = {}) {
        super(messageKey, params, { statusCode: 502, isRetryable: true });
    }
}

const upstreamValidationSchema = z.object({
    message: z.string().optional(),
    validationErrors: z
        .array(
            z.object({
                message: z.string().optional(),
                path: z.string().optional(),
            }),
        )
        .optional(),
});

/**
 * mittwald answers a rejected stack declaration with its validation errors.
 * The one users actually hit is an image reference the platform cannot pull
 * (private or missing package), so that case gets its own message; everything
 * else surfaces the upstream text as detail.
 */
export function stackDeclareError(
    status: number,
    body: unknown,
): UpstreamError {
    const parsed = upstreamValidationSchema.safeParse(body);
    if (parsed.success) {
        const imageError = parsed.data.validationErrors?.find(
            (validationError) => validationError.path === "imageReference",
        );
        if (imageError) {
            const image = /'([^']+)'/.exec(imageError.message ?? "")?.[1];
            if (image) {
                return new UpstreamError("error.upstream.imageMissing", {
                    image,
                });
            }
        }
        if (parsed.data.message) {
            return new UpstreamError("error.upstream.stackDeclare", {
                status,
                detail: parsed.data.message,
            });
        }
    }

    return new UpstreamError("error.upstream.stackDeclare", {
        status,
        detail: "",
    });
}
