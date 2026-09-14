import {
    Button,
    Heading,
    IconDanger,
    IllustratedMessage,
    Text,
} from "@mittwald/flow-remote-react-components";
import type { FallbackProps } from "react-error-boundary";
import { parsePublicError } from "@/global-errors.ts";
import { useTranslation } from "@/i18n/react.tsx";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    const t = useTranslation();
    const publicError = parsePublicError(error);

    return (
        <IllustratedMessage>
            <IconDanger />
            <Heading>{t("error.fallback.heading")}</Heading>
            <Text>{t("error.fallback.text")}</Text>
            {publicError && (
                <>
                    <Text>{publicError.message}</Text>
                    {publicError.isRetryable && (
                        <Button onPress={resetErrorBoundary}>
                            {t("error.fallback.retry")}
                        </Button>
                    )}
                </>
            )}
        </IllustratedMessage>
    );
}
