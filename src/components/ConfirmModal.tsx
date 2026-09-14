import {
    ActionGroup,
    Button,
    Content,
    Heading,
    Markdown,
    Modal,
    type OverlayController,
} from "@mittwald/flow-remote-react-components";
import { useState } from "react";
import { useTranslation } from "@/i18n/react.tsx";

interface ConfirmModalProps {
    controller: OverlayController;
    heading: string;
    text: string;
    confirmLabel: string;
    color: "primary" | "danger";
    onConfirm: () => Promise<unknown>;
}

/**
 * Asks before it acts. Driven by a controller so a context menu item can
 * open it. Uses the controller directly instead of Flow's Action
 * confirmation because closeOverlay did not work inside mStudio.
 */
export const ConfirmModal = ({
    controller,
    heading,
    text,
    confirmLabel,
    color,
    onConfirm,
}: ConfirmModalProps) => {
    const t = useTranslation();
    const [pending, setPending] = useState(false);

    const confirm = async () => {
        setPending(true);
        try {
            await onConfirm();
        } finally {
            setPending(false);
            controller.close();
        }
    };

    return (
        <Modal size="s" controller={controller}>
            <Heading>{heading}</Heading>
            <Content>
                <Markdown>{text}</Markdown>
            </Content>
            <ActionGroup>
                <Button color={color} isPending={pending} onPress={confirm}>
                    {confirmLabel}
                </Button>
                <Button
                    color="secondary"
                    variant="soft"
                    isDisabled={pending}
                    onPress={controller.close}
                >
                    {t("form.cancel")}
                </Button>
            </ActionGroup>
        </Modal>
    );
};
