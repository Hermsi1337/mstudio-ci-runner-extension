import {
    ActionGroup,
    Badge,
    Button,
    Heading,
    IconSearch,
    IllustratedMessage,
    Link,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
    Text,
} from "@mittwald/flow-remote-react-components";
import { useEffect, useState } from "react";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";
import { ConfigureRunnerModal } from "./ConfigureRunnerModal.tsx";
import { RunnerLogsModal } from "./RunnerLogsModal.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const REFRESH_INTERVAL_MS = 15_000;

export const RunnerTable = () => {
    const t = useTranslation();
    const { value: runners, invalidate } =
        RunnerClientGhost.listRunners().useGhost();
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => void invalidate(), REFRESH_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [invalidate]);

    const run = async (runnerId: string, action: () => Promise<unknown>) => {
        setBusy(runnerId);
        try {
            await action();
        } finally {
            setBusy(null);
            void invalidate();
        }
    };

    if (runners.length === 0) {
        return (
            <IllustratedMessage>
                <IconSearch />
                <Heading>{t("runners.empty.heading")}</Heading>
                <Text>{t("runners.empty.text")}</Text>
            </IllustratedMessage>
        );
    }

    return (
        <Table aria-label={t("runners.heading")}>
            <TableHeader>
                <TableColumn isRowHeader>
                    {t("runners.column.name")}
                </TableColumn>
                <TableColumn>{t("runners.column.provider")}</TableColumn>
                <TableColumn>{t("runners.column.target")}</TableColumn>
                <TableColumn>{t("runners.column.labels")}</TableColumn>
                <TableColumn>{t("runners.column.size")}</TableColumn>
                <TableColumn>{t("runners.column.cache")}</TableColumn>
                <TableColumn>{t("runners.column.version")}</TableColumn>
                <TableColumn>{t("runners.column.status")}</TableColumn>
                <TableColumn>{t("runners.column.actions")}</TableColumn>
            </TableHeader>
            <TableBody>
                {runners.map((runner) => (
                    <TableRow key={runner.id}>
                        <TableCell>
                            {runner.name}
                            {runner.ephemeral
                                ? ` ${t("runners.ephemeralSuffix")}`
                                : ""}
                        </TableCell>
                        <TableCell>
                            {t(`provider.${runner.provider}`)}
                        </TableCell>
                        <TableCell>
                            <Link href={runner.targetUrl} target="_blank">
                                {runner.target}
                            </Link>
                        </TableCell>
                        <TableCell>{runner.labels.join(", ")}</TableCell>
                        <TableCell>{t(`form.size.${runner.size}`)}</TableCell>
                        <TableCell>
                            {runner.cache
                                ? t("runners.cache.limit", {
                                      size: runner.cacheSizeGb,
                                  })
                                : t("runners.cache.off")}
                        </TableCell>
                        <TableCell>
                            {runner.runnerVersion ??
                                t("runners.version.unknown")}
                            {runner.updateAvailable && (
                                <>
                                    {" "}
                                    <Badge color="blue">
                                        {t("runners.version.updateAvailable", {
                                            version: runner.latestRunnerVersion,
                                        })}
                                    </Badge>
                                </>
                            )}
                        </TableCell>
                        <TableCell>
                            <StatusBadge status={runner.status} />
                        </TableCell>
                        <TableCell>
                            <ActionGroup>
                                <RunnerLogsModal
                                    runnerId={runner.id}
                                    name={runner.name}
                                />
                                <ConfigureRunnerModal runner={runner} />
                                <Button
                                    color="secondary"
                                    variant="soft"
                                    size="s"
                                    isDisabled={busy === runner.id}
                                    onPress={() =>
                                        run(runner.id, () =>
                                            RunnerClientGhost.restartRunner({
                                                data: { runnerId: runner.id },
                                            }),
                                        )
                                    }
                                >
                                    {t("runners.action.restart")}
                                </Button>
                                {runner.updateAvailable && (
                                    <Button
                                        color="primary"
                                        variant="soft"
                                        size="s"
                                        isDisabled={busy === runner.id}
                                        onPress={() =>
                                            run(runner.id, () =>
                                                RunnerClientGhost.updateRunner({
                                                    data: {
                                                        runnerId: runner.id,
                                                    },
                                                }),
                                            )
                                        }
                                    >
                                        {t("runners.action.update")}
                                    </Button>
                                )}
                                <Button
                                    color="danger"
                                    variant="soft"
                                    size="s"
                                    isDisabled={busy === runner.id}
                                    onPress={() =>
                                        run(runner.id, () =>
                                            RunnerClientGhost.deleteRunner({
                                                data: { runnerId: runner.id },
                                            }),
                                        )
                                    }
                                >
                                    {t("runners.action.delete")}
                                </Button>
                            </ActionGroup>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
