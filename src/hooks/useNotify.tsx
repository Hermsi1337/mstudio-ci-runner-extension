import {
    Heading,
    Notification,
    Text,
    useNotificationController,
} from "@mittwald/flow-remote-react-components";
import { useCallback } from "react";
import { parsePublicError } from "@/global-errors.ts";
import { useTranslation } from "@/i18n/react.tsx";

type Status = "success" | "info" | "warning" | "danger";

/**
 * Toasts through Flow's NotificationProvider. `failure` turns any error into
 * a danger notification with the public message when there is one.
 */
export function useNotify() {
    const controller = useNotificationController();
    const t = useTranslation();

    const notify = useCallback(
        (status: Status, heading: string, text?: string) => {
            controller.add(
                <Notification status={status} autoClose>
                    <Heading>{heading}</Heading>
                    {text && <Text>{text}</Text>}
                </Notification>,
            );
        },
        [controller],
    );

    const failure = useCallback(
        (heading: string, error: unknown) => {
            const publicError =
                error instanceof Error ? parsePublicError(error) : null;
            notify(
                "danger",
                heading,
                publicError?.message ?? t("error.unexpected"),
            );
        },
        [notify, t],
    );

    return { notify, failure };
}
