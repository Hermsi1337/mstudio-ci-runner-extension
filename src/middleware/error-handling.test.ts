import { describe, expect, it } from "vitest";
import { parsePublicError, UpstreamError } from "@/global-errors.ts";
import { classifyError, toErrorBody } from "./error-body.ts";

/**
 * The client contract: the middleware serialises the error body into an
 * Error message, and parsePublicError reads it back. This broke once when a
 * thrown Response silently resolved the call, so the round trip is pinned.
 */
function roundTrip(error: unknown) {
    const body = toErrorBody(classifyError(error), "en");
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
