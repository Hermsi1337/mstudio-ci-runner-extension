import {
    Button,
    CodeBlock,
    Content,
    Flex,
    Heading,
    IconPending,
    IllustratedMessage,
    Label,
    Modal,
    ModalTrigger,
    Option,
    Select,
    SkeletonText,
    Switch,
    Text,
} from "@mittwald/flow-remote-react-components";
import { Suspense, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import type { RunnerStatus } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";

const FOLLOW_INTERVAL_MS = 5_000;
const tailOptions = [100, 300, 1000] as const;

const Logs = ({
    runnerId,
    tail,
    follow,
}: {
    runnerId: string;
    tail: number;
    follow: boolean;
}) => {
    const t = useTranslation();
    const { value: logs, invalidate } = RunnerClientGhost.getRunnerLogs({
        data: { runnerId, tail },
    }).useGhost();

    useEffect(() => {
        if (!follow) {
            return;
        }
        const timer = setInterval(() => void invalidate(), FOLLOW_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [follow, invalidate]);

    if (!logs) {
        return (
            <IllustratedMessage color="light">
                <IconPending />
                <Heading>{t("runners.logs.empty.heading")}</Heading>
                <Text>{t("runners.logs.empty.text")}</Text>
            </IllustratedMessage>
        );
    }
    return <CodeBlock code={logs} copyable wrapLongLines />;
};

export const RunnerLogsModal = ({
    runnerId,
    name,
    status,
}: {
    runnerId: string;
    name: string;
    status: RunnerStatus;
}) => {
    const t = useTranslation();
    const [tail, setTail] = useState<number>(300);
    const [follow, setFollow] = useState(
        status === "creating" || status === "starting",
    );
    return (
        <ModalTrigger>
            <Button color="secondary" variant="soft" size="s">
                {t("runners.action.logs")}
            </Button>
            <Modal size="l">
                <Heading>{t("runners.logs.heading", { name })}</Heading>
                <Content>
                    <Flex align="end" gap="m" wrap="wrap">
                        <Select
                            selectedKey={String(tail)}
                            onChange={(key) => setTail(Number(key))}
                        >
                            <Label>{t("runners.logs.tail")}</Label>
                            {tailOptions.map((option) => (
                                <Option key={option} value={String(option)}>
                                    {t("runners.logs.lines", { lines: option })}
                                </Option>
                            ))}
                        </Select>
                        <Switch isSelected={follow} onChange={setFollow}>
                            {t("runners.logs.follow")}
                        </Switch>
                    </Flex>
                    <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<SkeletonText />}>
                            <Logs
                                runnerId={runnerId}
                                tail={tail}
                                follow={follow}
                            />
                        </Suspense>
                    </ErrorBoundary>
                </Content>
            </Modal>
        </ModalTrigger>
    );
};
