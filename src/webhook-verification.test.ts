import { describe, expect, it, vi } from "vitest";
import {
    strictVerification,
    WebhookSignatureInvalidError,
} from "./webhook-verification.ts";

const content = {
    rawBody: "{}",
    signatureSerial: "serial",
    signatureAlgorithm: "ed25519",
    signature: "sig",
};

describe("strictVerification", () => {
    it("calls the next handler when the signature verifies", async () => {
        const next = vi.fn().mockResolvedValue(undefined);
        const handler = strictVerification({
            verify: vi.fn().mockResolvedValue(true),
        });

        await handler.handleWebhook(content, next);

        expect(next).toHaveBeenCalledWith(content);
    });

    it("throws when the verifier resolves false instead of throwing", async () => {
        const next = vi.fn();
        const handler = strictVerification({
            verify: vi.fn().mockResolvedValue(false),
        });

        await expect(handler.handleWebhook(content, next)).rejects.toThrow(
            WebhookSignatureInvalidError,
        );
        expect(next).not.toHaveBeenCalled();
    });

    it("propagates verifier errors", async () => {
        const next = vi.fn();
        const handler = strictVerification({
            verify: vi.fn().mockRejectedValue(new Error("missing signature")),
        });

        await expect(handler.handleWebhook(content, next)).rejects.toThrow(
            "missing signature",
        );
        expect(next).not.toHaveBeenCalled();
    });
});
