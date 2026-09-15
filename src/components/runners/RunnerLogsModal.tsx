import {
    CodeBlock,
    Content,
    Flex,
    Heading,
    IconPending,
    IllustratedMessage,
    Label,
    Modal,
    Option,
    type OverlayController,
    Select,
    SkeletonText,
    Switch,
    Text,
} from "@mittwald/flow-remote-react-components";
import { Suspense, useEffect, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import type { Runner } from "@/generated/extension-api";
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
            <IllustratedMessage>
                <IconPending />
                <Heading>{t("runners.logs.empty.heading")}</Heading>
                <Text>{t("runners.logs.empty.text")}</Text>
            </IllustratedMessage>
        );
    }
    return <CodeBlock code={logs} copyable />;
};

export const RunnerLogsModal = ({
    runner,
    controller,
}: {
    runner: Runner;
    controller: OverlayController;
}) => {
    const t = useTranslation();
    const [tail, setTail] = useState<number>(300);
    const [follow, setFollow] = useState(
        runner.status === "creating" || runner.status === "starting",
    );
    return (
        <Modal offCanvas size="l" controller={controller}>
            <Heading>
                {t("runners.logs.heading", { name: runner.name })}
            </Heading>
            <Content>
                <Flex align="end" gap="m" wrap="wrap">
                    <Select
                        isRequired
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
                            runnerId={runner.id}
                            tail={tail}
                            follow={follow}
                        />
                    </Suspense>
                </ErrorBoundary>
            </Content>
        </Modal>
    );
};
