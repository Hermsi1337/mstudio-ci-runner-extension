import {
    Button,
    Content,
    Heading,
    Modal,
    ModalTrigger,
} from "@mittwald/flow-remote-react-components";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { RunnerForm } from "./RunnerForm.tsx";

export const CreateRunnerModal = () => (
    <ModalTrigger>
        <Button color="primary">Create runner</Button>
        <Modal size="m">
            <Heading>Create runner</Heading>
            <Content>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <RunnerForm />
                </ErrorBoundary>
            </Content>
        </Modal>
    </ModalTrigger>
);
