import {
    Button,
    CodeBlock,
    Content,
    Heading,
    Modal,
    ModalTrigger,
    SkeletonText,
} from "@mittwald/flow-remote-react-components";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { RunnerClientGhost } from "@/ghosts.ts";

const Logs = ({ runnerId }: { runnerId: string }) => {
    const logs = RunnerClientGhost.getRunnerLogs({
        data: { runnerId, tail: 300 },
    }).use();
    return <CodeBlock code={logs || "(no logs yet)"} />;
};

export const RunnerLogsModal = ({
    runnerId,
    name,
}: {
    runnerId: string;
    name: string;
}) => (
    <ModalTrigger>
        <Button color="secondary" variant="soft" size="s">
            Logs
        </Button>
        <Modal size="l">
            <Heading>Logs: {name}</Heading>
            <Content>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Suspense fallback={<SkeletonText />}>
                        <Logs runnerId={runnerId} />
                    </Suspense>
                </ErrorBoundary>
            </Content>
        </Modal>
    </ModalTrigger>
);
