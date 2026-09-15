import {
    ContextMenu,
    IconChangelog,
    IconDelete,
    IconInfo,
    IconRefresh,
    IconSettings,
    IconUpload,
    MenuItem,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { ChangelogModal } from "@/components/ChangelogModal.tsx";
import { ConfirmModal } from "@/components/ConfirmModal.tsx";
import type { Runner } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useNotify } from "@/hooks/useNotify.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { ConfigureRunnerModal } from "./ConfigureRunnerModal.tsx";
import { RunnerLogsModal } from "./RunnerLogsModal.tsx";

interface RunnerActionsProps {
    runner: Runner;
    onChanged: () => void;
}

/**
 * The options menu of a list row. Every modal has its own controller so a
 * menu item can open it; the modals mount their content only while open.
 */
export const RunnerActions = ({ runner, onChanged }: RunnerActionsProps) => {
    const t = useTranslation();
    const { notify, failure } = useNotify();
    const own = { reuseControllerFromContext: false };
    const logs = useOverlayController("Modal", own);
    const settings = useOverlayController("Modal", own);
    const restart = useOverlayController("Modal", own);
    const update = useOverlayController("Modal", own);
    const changelog = useOverlayController("Modal", own);
    const remove = useOverlayController("Modal", own);

    const run = async (
        action: () => Promise<unknown>,
        done: string,
        failed: string,
    ) => {
        try {
            await action();
            notify("success", done);
        } catch (error) {
            failure(failed, error);
        } finally {
            onChanged();
        }
    };

    const actions: Record<string, () => void> = {
        logs: logs.open,
        settings: settings.open,
        restart: restart.open,
        update: update.open,
        changelog: changelog.open,
        delete: remove.open,
    };

    return (
        <>
            <ContextMenu onAction={(key) => actions[String(key)]?.()}>
                <MenuItem id="logs">
                    <IconChangelog />
                    <Text>{t("runners.action.logs")}</Text>
                </MenuItem>
                <MenuItem id="settings">
                    <IconSettings />
                    <Text>{t("runners.action.configure")}</Text>
                </MenuItem>
                <MenuItem id="restart">
                    <IconRefresh />
                    <Text>{t("runners.action.restart")}</Text>
                </MenuItem>
                {runner.updateAvailable && (
                    <MenuItem id="update">
                        <IconUpload />
                        <Text>
                            {t("runners.version.updateAvailable", {
                                version:
                                    runner.latestImageVersion ??
                                    runner.latestRunnerVersion,
                            })}
                        </Text>
                    </MenuItem>
                )}
                {runner.updateAvailable && runner.imageVersion && (
                    <MenuItem id="changelog">
                        <IconInfo />
                        <Text>
                            {t("runners.action.changelogSince", {
                                version: runner.imageVersion,
                            })}
                        </Text>
                    </MenuItem>
                )}
                <MenuItem id="delete">
                    <IconDelete />
                    <Text>{t("runners.action.delete")}</Text>
                </MenuItem>
            </ContextMenu>

            <RunnerLogsModal runner={runner} controller={logs} />
            <ConfigureRunnerModal runner={runner} controller={settings} />
            <ChangelogModal
                controller={changelog}
                sinceVersion={runner.imageVersion}
            />
            <ConfirmModal
                controller={restart}
                color="primary"
                heading={t("runners.restart.heading", { name: runner.name })}
                text={t("runners.restart.text")}
                confirmLabel={t("runners.action.restart")}
                onConfirm={() =>
                    run(
                        () =>
                            RunnerClientGhost.restartRunner({
                                data: { runnerId: runner.id },
                            }),
                        t("runners.notice.restarted", { name: runner.name }),
                        t("runners.notice.restartFailed", {
                            name: runner.name,
                        }),
                    )
                }
            />
            <ConfirmModal
                controller={update}
                color="primary"
                heading={t("runners.update.heading", { name: runner.name })}
                text={t("runners.update.text", {
                    version:
                        runner.latestImageVersion ?? runner.latestRunnerVersion,
                })}
                confirmLabel={t("runners.action.update")}
                onConfirm={() =>
                    run(
                        () =>
                            RunnerClientGhost.updateRunner({
                                data: { runnerId: runner.id },
                            }),
                        t("runners.notice.updated", { name: runner.name }),
                        t("runners.notice.updateFailed", {
                            name: runner.name,
                        }),
                    )
                }
            />
            <ConfirmModal
                controller={remove}
                color="danger"
                heading={t("runners.delete.heading", { name: runner.name })}
                text={
                    runner.provider === "github"
                        ? t(`runners.delete.text.github.${runner.tokenType}`)
                        : t("runners.delete.text.gitlab")
                }
                confirmLabel={t("runners.action.delete")}
                onConfirm={() =>
                    run(
                        () =>
                            RunnerClientGhost.deleteRunner({
                                data: { runnerId: runner.id },
                            }),
                        t("runners.notice.deleted", { name: runner.name }),
                        t("runners.notice.deleteFailed", {
                            name: runner.name,
                        }),
                    )
                }
            />
        </>
    );
};
