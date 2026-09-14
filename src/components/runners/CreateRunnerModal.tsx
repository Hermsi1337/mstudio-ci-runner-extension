import {
    Button,
    Heading,
    Modal,
    ModalTrigger,
} from "@mittwald/flow-remote-react-components";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { RunnerForm } from "./RunnerForm.tsx";

/**
 * Size l gives the form its two columns: fields left, the resources the
 * runner gets in the project right (ColumnLayout plus AccentBox inside
 * RunnerForm). Not dismissable by clicking outside so a half-filled form
 * does not vanish.
 */
export const CreateRunnerModal = () => {
    const t = useTranslation();
    return (
        <ModalTrigger>
            <Button color="primary">{t("form.create.button")}</Button>
            <Modal size="l" isDismissable={false}>
                <Heading>{t("form.create.heading")}</Heading>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <RunnerForm />
                </ErrorBoundary>
            </Modal>
        </ModalTrigger>
    );
};
