import {
    ActionGroup,
    Badge,
    Button,
    Flex,
    Heading,
    IconContainer,
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
import { ConfirmButton } from "@/components/ConfirmButton.tsx";
import type { Runner } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useNotify } from "@/hooks/useNotify.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { ConfigureRunnerModal } from "./ConfigureRunnerModal.tsx";
import { CreateRunnerModal } from "./CreateRunnerModal.tsx";
import { RunnerLogsModal } from "./RunnerLogsModal.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const REFRESH_INTERVAL_MS = 15_000;
const BUSY_REFRESH_INTERVAL_MS = 5_000;
const transientStatuses: Runner["status"][] = [
    "creating",
    "starting",
    "stopping",
];

export const RunnerTable = () => {
    const t = useTranslation();
    const { notify, failure } = useNotify();
    const { value: runners, invalidate } =
        RunnerClientGhost.listRunners().useGhost();
    const [busy, setBusy] = useState<string | null>(null);
    const anyTransient = runners.some((r) =>
        transientStatuses.includes(r.status),
    );

    useEffect(() => {
        const timer = setInterval(
            () => void invalidate(),
            anyTransient ? BUSY_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS,
        );
        return () => clearInterval(timer);
    }, [invalidate, anyTransient]);

    const run = async (
        runner: Runner,
        action: () => Promise<unknown>,
        done: string,
        failed: string,
    ) => {
        setBusy(runner.id);
        try {
            await action();
            notify("success", done);
        } catch (error) {
            failure(failed, error);
        } finally {
            setBusy(null);
            void invalidate();
        }
    };

    if (runners.length === 0) {
        return (
            <IllustratedMessage>
                <IconContainer />
                <Heading>{t("runners.empty.heading")}</Heading>
                <Text>{t("runners.empty.text")}</Text>
                <CreateRunnerModal />
            </IllustratedMessage>
        );
    }

    return (
        <Table aria-label={t("runners.heading")}>
            <TableHeader>
                <TableColumn isRowHeader>
                    {t("runners.column.name")}
                </TableColumn>
                <TableColumn>{t("runners.column.target")}</TableColumn>
                <TableColumn>{t("runners.column.labels")}</TableColumn>
                <TableColumn>{t("runners.column.size")}</TableColumn>
                <TableColumn>{t("runners.column.cache")}</TableColumn>
                <TableColumn>{t("runners.column.version")}</TableColumn>
                <TableColumn>{t("runners.column.status")}</TableColumn>
                <TableColumn horizontalAlign="end">
                    {t("runners.column.actions")}
                </TableColumn>
            </TableHeader>
            <TableBody>
                {runners.map((runner) => (
                    <TableRow key={runner.id}>
                        <TableCell>
                            <Flex align="center" gap="xs" wrap="wrap">
                                {runner.studioUrl ? (
                                    <Link
                                        href={runner.studioUrl}
                                        target="_blank"
                                    >
                                        {runner.name}
                                    </Link>
                                ) : (
                                    <Text>{runner.name}</Text>
                                )}
                                {runner.ephemeral && (
                                    <Badge color="violet">
                                        {t("runners.ephemeral")}
                                    </Badge>
                                )}
                            </Flex>
                            <Text color="light">
                                {t(`provider.${runner.provider}`)}
                            </Text>
                        </TableCell>
                        <TableCell>
                            <Link href={runner.targetUrl} target="_blank">
                                {runner.target}
                            </Link>
                        </TableCell>
                        <TableCell>
                            {runner.labels.length > 0 ? (
                                <Flex gap="xs" wrap="wrap">
                                    {runner.labels.map((label) => (
                                        <Badge key={label}>{label}</Badge>
                                    ))}
                                </Flex>
                            ) : (
                                <Text color="light">
                                    {t("runners.labels.inCiSystem")}
                                </Text>
                            )}
                        </TableCell>
                        <TableCell>
                            {t(`form.size.${runner.size}`)}
                            {runner.concurrency > 1 && (
                                <Text color="light">
                                    {t("runners.concurrency", {
                                        jobs: runner.concurrency,
                                    })}
                                </Text>
                            )}
                        </TableCell>
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
                            {runner.statusMessage &&
                                (runner.status === "error" ||
                                    runner.status === "missing") && (
                                    <Text color="light">
                                        {runner.statusMessage}
                                    </Text>
                                )}
                        </TableCell>
                        <TableCell>
                            <ActionGroup>
                                <RunnerLogsModal
                                    runnerId={runner.id}
                                    name={runner.name}
                                    status={runner.status}
                                />
                                <ConfigureRunnerModal runner={runner} />
                                <Button
                                    color="secondary"
                                    variant="soft"
                                    size="s"
                                    isPending={busy === runner.id}
                                    isDisabled={busy !== null}
                                    onPress={() =>
                                        run(
                                            runner,
                                            () =>
                                                RunnerClientGhost.restartRunner(
                                                    {
                                                        data: {
                                                            runnerId: runner.id,
                                                        },
                                                    },
                                                ),
                                            t("runners.notice.restarted", {
                                                name: runner.name,
                                            }),
                                            t("runners.notice.restartFailed", {
                                                name: runner.name,
                                            }),
                                        )
                                    }
                                >
                                    {t("runners.action.restart")}
                                </Button>
                                {runner.updateAvailable && (
                                    <ConfirmButton
                                        color="primary"
                                        label={t("runners.action.update")}
                                        heading={t("runners.update.heading", {
                                            name: runner.name,
                                        })}
                                        text={t("runners.update.text", {
                                            version: runner.latestRunnerVersion,
                                        })}
                                        confirmLabel={t(
                                            "runners.action.update",
                                        )}
                                        isDisabled={busy !== null}
                                        onConfirm={() =>
                                            run(
                                                runner,
                                                () =>
                                                    RunnerClientGhost.updateRunner(
                                                        {
                                                            data: {
                                                                runnerId:
                                                                    runner.id,
                                                            },
                                                        },
                                                    ),
                                                t("runners.notice.updated", {
                                                    name: runner.name,
                                                }),
                                                t(
                                                    "runners.notice.updateFailed",
                                                    { name: runner.name },
                                                ),
                                            )
                                        }
                                    />
                                )}
                                <ConfirmButton
                                    color="danger"
                                    label={t("runners.action.delete")}
                                    heading={t("runners.delete.heading", {
                                        name: runner.name,
                                    })}
                                    text={t(
                                        `runners.delete.text.${runner.provider}`,
                                    )}
                                    confirmLabel={t("runners.action.delete")}
                                    isDisabled={busy !== null}
                                    onConfirm={() =>
                                        run(
                                            runner,
                                            () =>
                                                RunnerClientGhost.deleteRunner({
                                                    data: {
                                                        runnerId: runner.id,
                                                    },
                                                }),
                                            t("runners.notice.deleted", {
                                                name: runner.name,
                                            }),
                                            t("runners.notice.deleteFailed", {
                                                name: runner.name,
                                            }),
                                        )
                                    }
                                />
                            </ActionGroup>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
