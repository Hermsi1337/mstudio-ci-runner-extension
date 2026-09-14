import {
    ActionGroup,
    Button,
    Content,
    Heading,
    Modal,
    ModalTrigger,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { useState } from "react";
import { useTranslation } from "@/i18n/react.tsx";

interface ConfirmButtonProps {
    label: string;
    heading: string;
    text: string;
    confirmLabel: string;
    color: "primary" | "danger";
    isDisabled?: boolean;
    onConfirm: () => Promise<unknown>;
}

const Confirmation = ({
    heading,
    text,
    confirmLabel,
    color,
    onConfirm,
}: Omit<ConfirmButtonProps, "label" | "isDisabled">) => {
    const t = useTranslation();
    const modal = useOverlayController("Modal");
    const [pending, setPending] = useState(false);

    const confirm = async () => {
        setPending(true);
        try {
            await onConfirm();
        } finally {
            setPending(false);
            modal.close();
        }
    };

    return (
        <>
            <Heading>{heading}</Heading>
            <Content>
                <Text>{text}</Text>
            </Content>
            <ActionGroup>
                <Button color={color} isPending={pending} onPress={confirm}>
                    {confirmLabel}
                </Button>
                <Button
                    color="secondary"
                    variant="soft"
                    isDisabled={pending}
                    onPress={modal.close}
                >
                    {t("form.cancel")}
                </Button>
            </ActionGroup>
        </>
    );
};

/**
 * A button that asks before it acts. Uses the overlay controller directly
 * instead of Flow's Action confirmation because closeOverlay did not work
 * inside mStudio.
 */
export const ConfirmButton = ({
    label,
    isDisabled,
    color,
    ...confirmation
}: ConfirmButtonProps) => (
    <ModalTrigger>
        <Button color={color} variant="soft" size="s" isDisabled={isDisabled}>
            {label}
        </Button>
        <Modal size="s">
            <Confirmation color={color} {...confirmation} />
        </Modal>
    </ModalTrigger>
);
