import type { WebhookHandler } from "@weissaufschwarz/mitthooks/handler/interface";
import type { WebhookContent } from "@weissaufschwarz/mitthooks/webhook";

export class WebhookSignatureInvalidError extends Error {
    public constructor() {
        super("webhook signature verification failed");
        this.name = "WebhookSignatureInvalidError";
    }
}

export interface SignatureVerifier {
    verify(content: WebhookContent): Promise<boolean>;
}

/**
 * mitthooks 0.3.0's own VerifyingWebhookHandler discards the boolean result
 * of the verifier, and @noble/ed25519 reports an invalid signature by
 * resolving false instead of throwing, so forged webhooks pass. This wrapper
 * enforces a strict result and runs as the first handler in the chain.
 */
export function strictVerification(
    verifier: SignatureVerifier,
): WebhookHandler {
    return {
        async handleWebhook(content, next) {
            const verified = await verifier.verify(content);
            if (verified !== true) {
                throw new WebhookSignatureInvalidError();
            }

            return next(content);
        },
    };
}
