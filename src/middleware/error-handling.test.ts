import { beforeAll, describe, expect, it, vi } from "vitest";
import { parsePublicError, UpstreamError } from "@/global-errors.ts";

// The logger reads the environment on first use; the middleware logs on every
// error path, so the env must exist before that module runs.
beforeAll(() => {
    for (const [key, value] of Object.entries({
        POSTGRES_USER: "u",
        POSTGRES_PASSWORD: "p",
        POSTGRES_DB: "d",
        POSTGRES_HOST: "h",
        POSTGRES_PORT: "5432",
        EXTENSION_ID: "e",
        EXTENSION_SECRET: "s",
        ENCRYPTION_MASTER_PASSWORD: "m",
        ENCRYPTION_SALT: "salt",
    })) {
        vi.stubEnv(key, value);
    }
});

const { toErrorBody } = await import("./error-handling.ts");

/**
 * The client contract: the middleware serialises the error body into an
 * Error message, and parsePublicError reads it back. This broke once when a
 * thrown Response silently resolved the call, so the round trip is pinned.
 */
function roundTrip(error: unknown) {
    const body = toErrorBody(error, "en");
    return parsePublicError(new Error(JSON.stringify(body)));
}

describe("error body contract", () => {
    it("round-trips a PublicError with its translated message and status", () => {
        const parsed = roundTrip(
            new UpstreamError("error.upstream.stackGet", { status: 502 }),
        );
        expect(parsed?.type).toBe("UpstreamError");
        expect(parsed?.isRetryable).toBe(true);
        expect(parsed?.message).toContain("502");
    });

    it("round-trips a zod validation error with the affected field", () => {
        const zodIssues = JSON.stringify([
            { path: ["name"], message: "String must contain at least 2" },
        ]);
        const parsed = roundTrip(new Error(zodIssues));
        expect(parsed?.type).toBe("ValidationError");
        expect(parsed?.details.affectedField).toBe("name");
    });

    it("maps an unknown error to a generic body", () => {
        const parsed = roundTrip(new Error("boom"));
        expect(parsed?.type).toBe("UnknownError");
        expect(parsed?.isRetryable).toBe(false);
    });
});
