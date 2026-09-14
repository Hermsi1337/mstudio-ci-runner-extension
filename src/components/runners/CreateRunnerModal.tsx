import {
    Button,
    Content,
    Heading,
    Modal,
    ModalTrigger,
} from "@mittwald/flow-remote-react-components";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { RunnerForm } from "./RunnerForm.tsx";

/**
 * Flow attaches a close icon to every Heading in the Modal title slot. The
 * heading lives inside Content instead, so the modal only closes via the
 * cancel button in the form.
 */
export const CreateRunnerModal = () => {
    const t = useTranslation();
    return (
        <ModalTrigger>
            <Button color="primary">{t("form.create.button")}</Button>
            <Modal size="m">
                <Content>
                    <Heading level={2}>{t("form.create.heading")}</Heading>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <RunnerForm />
                    </ErrorBoundary>
                </Content>
            </Modal>
        </ModalTrigger>
    );
};
