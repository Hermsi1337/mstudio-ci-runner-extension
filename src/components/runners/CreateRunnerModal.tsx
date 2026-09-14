import {
    Heading,
    Modal,
    type OverlayController,
} from "@mittwald/flow-remote-react-components";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { RunnerForm } from "./RunnerForm.tsx";

/**
 * Size l gives the form its two columns: fields left, the resources the
 * runner gets in the project right (ColumnLayout plus AccentBox inside
 * RunnerForm). Not dismissable by clicking outside so a half-filled form
 * does not vanish. Driven by a controller because a ModalTrigger inside the
 * card header would hand the form's ActionGroup to the header's action slot.
 */
export const CreateRunnerModal = ({
    controller,
}: {
    controller: OverlayController;
}) => {
    const t = useTranslation();
    return (
        <Modal size="l" isDismissable={false} controller={controller}>
            <Heading>{t("form.create.heading")}</Heading>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <RunnerForm />
            </ErrorBoundary>
        </Modal>
    );
};
