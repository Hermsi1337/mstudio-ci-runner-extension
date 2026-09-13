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

export const CreateRunnerModal = () => {
    const t = useTranslation();
    return (
        <ModalTrigger>
            <Button color="primary">{t("form.create.button")}</Button>
            <Modal size="m">
                <Heading>{t("form.create.heading")}</Heading>
                <Content>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <RunnerForm />
                    </ErrorBoundary>
                </Content>
            </Modal>
        </ModalTrigger>
    );
};
