import {
    Button,
    Heading,
    IconDanger,
    IllustratedMessage,
    Text,
} from "@mittwald/flow-remote-react-components";
import type { FallbackProps } from "react-error-boundary";
import { parsePublicError } from "@/global-errors.ts";

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
    const publicError = parsePublicError(error);

    let errorDetails = null;

    if (publicError) {
        errorDetails = (
            <>
                <Text>{publicError.message}</Text>
                {publicError.isRetryable && (
                    <Button onPress={resetErrorBoundary}>
                        Erneut versuchen
                    </Button>
                )}
            </>
        );
    }

    return (
        <IllustratedMessage>
            <IconDanger />
            <Heading>Ups.</Heading>
            <Text>Hier ist etwas schief gelaufen.</Text>
            {errorDetails}
        </IllustratedMessage>
    );
}
