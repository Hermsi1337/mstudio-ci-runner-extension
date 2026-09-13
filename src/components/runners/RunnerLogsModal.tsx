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
import { useTranslation } from "@/i18n/react.tsx";

const Logs = ({ runnerId }: { runnerId: string }) => {
    const t = useTranslation();
    const logs = RunnerClientGhost.getRunnerLogs({
        data: { runnerId, tail: 300 },
    }).use();
    return <CodeBlock code={logs || t("runners.logs.empty")} />;
};

export const RunnerLogsModal = ({
    runnerId,
    name,
}: {
    runnerId: string;
    name: string;
}) => {
    const t = useTranslation();
    return (
        <ModalTrigger>
            <Button color="secondary" variant="soft" size="s">
                {t("runners.action.logs")}
            </Button>
            <Modal size="l">
                <Heading>{t("runners.logs.heading", { name })}</Heading>
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
};
