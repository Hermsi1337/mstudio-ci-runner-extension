import { describe, expect, it } from "vitest";
import { stackDeclareError } from "./global-errors.ts";

const imageRejection = {
    type: "ValidationError",
    message:
        "3 INVALID_ARGUMENT: image reference 'ghcr.io/acme/runner:0.1.0' does not exist",
    validationErrors: [
        {
            type: "notFound",
            message:
                "image reference 'ghcr.io/acme/runner:0.1.0' does not exist",
            path: "imageReference",
            context: {},
        },
    ],
};

describe("stackDeclareError", () => {
    it("maps a missing image to its own message with the image name", () => {
        const publicError = stackDeclareError(400, imageRejection);
        expect(publicError.messageKey).toBe("error.upstream.imageMissing");
        expect(publicError.params).toEqual({
            image: "ghcr.io/acme/runner:0.1.0",
        });
    });

    it("passes the upstream message through as detail", () => {
        const publicError = stackDeclareError(400, {
            type: "ValidationError",
            message: "resources.memory: invalid value",
        });
        expect(publicError.messageKey).toBe("error.upstream.stackDeclare");
        expect(publicError.params).toEqual({
            status: 400,
            detail: "resources.memory: invalid value",
        });
    });

    it("falls back to the status for an unreadable body", () => {
        const publicError = stackDeclareError(502, "<html>bad gateway</html>");
        expect(publicError.messageKey).toBe("error.upstream.stackDeclare");
        expect(publicError.params).toEqual({ status: 502, detail: "" });
    });
});
