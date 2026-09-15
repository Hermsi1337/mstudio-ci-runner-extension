import {
    Alert,
    Badge,
    Content,
    Heading,
    IconChangelog,
    IllustratedMessage,
    Link,
    Markdown,
    Modal,
    type OverlayController,
    Section,
    SkeletonText,
    Text,
} from "@mittwald/flow-remote-react-components";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import type { Release } from "@/generated/extension-api";
import { ChangelogClientGhost } from "@/ghosts.ts";
import { useLocale, useTranslation } from "@/i18n/react.tsx";
import { isNewerVersion } from "@/version-compare.ts";

/**
 * The runner context of the modal: the image version the runner runs and the
 * version "Update" moves it to. Without it the modal describes the extension.
 */
export interface RunnerChangelogContext {
    name: string;
    imageVersion: string;
    targetVersion: string;
}

/**
 * Both bounds inclusive, so the release the runner runs and the update target
 * stay visible with their badges. An unparsable bound (a custom image tag)
 * does not filter at all.
 */
function releasesBetween(
    releases: Release[],
    from: string,
    to: string,
): Release[] {
    return releases.filter(
        (release) =>
            !isNewerVersion(from, release.version) &&
            !isNewerVersion(release.version, to),
    );
}

const ReleaseBadge = ({
    version,
    currentVersion,
    runner,
}: {
    version: string;
    currentVersion: string;
    runner?: RunnerChangelogContext;
}) => {
    const t = useTranslation();
    if (runner) {
        if (version === runner.imageVersion) {
            return <Badge>{t("changelog.runner.badge.current")}</Badge>;
        }
        if (version === runner.targetVersion) {
            return (
                <Badge color="blue">{t("changelog.runner.badge.target")}</Badge>
            );
        }
        return null;
    }
    if (version === currentVersion) {
        return <Badge>{t("changelog.current")}</Badge>;
    }
    return null;
};

const Releases = ({ runner }: { runner?: RunnerChangelogContext }) => {
    const t = useTranslation();
    const locale = useLocale();
    const { value: changelog } = ChangelogClientGhost.getChangelog(
        {},
    ).useGhost();
    const visible = runner
        ? releasesBetween(
              changelog.releases,
              runner.imageVersion,
              runner.targetVersion,
          )
        : changelog.releases;
    if (visible.length === 0) {
        return (
            <IllustratedMessage>
                <IconChangelog />
                <Heading>{t("changelog.empty.heading")}</Heading>
                <Text>{t("changelog.empty.text")}</Text>
            </IllustratedMessage>
        );
    }
    return (
        <>
            {visible.map((release) => (
                <Section key={release.version}>
                    <Heading>
                        {release.version}
                        <ReleaseBadge
                            version={release.version}
                            currentVersion={changelog.currentVersion}
                            runner={runner}
                        />
                    </Heading>
                    <Text>
                        {new Date(release.publishedAt).toLocaleDateString(
                            locale,
                            { dateStyle: "medium" },
                        )}
                    </Text>
                    <Markdown>{release.notes}</Markdown>
                    <Link href={release.url} target="_blank">
                        {t("changelog.github")}
                    </Link>
                </Section>
            ))}
        </>
    );
};

export const ChangelogModal = ({
    controller,
    runner,
}: {
    controller: OverlayController;
    runner?: RunnerChangelogContext;
}) => {
    const t = useTranslation();
    const { reset } = useQueryErrorResetBoundary();
    const isOpen = controller.useIsOpen();
    return (
        <Modal offCanvas size="m" controller={controller}>
            <Heading>
                {runner
                    ? t("changelog.runner.heading", { name: runner.name })
                    : t("changelog.heading")}
            </Heading>
            <Content>
                {runner && (
                    <Alert status="info">
                        <Heading>
                            {t("changelog.runner.summary.heading", {
                                from: runner.imageVersion,
                                to: runner.targetVersion,
                            })}
                        </Heading>
                        <Text>
                            {t("changelog.runner.summary.text", {
                                from: runner.imageVersion,
                                to: runner.targetVersion,
                            })}
                        </Text>
                    </Alert>
                )}
                {isOpen && (
                    <ErrorBoundary
                        onReset={reset}
                        FallbackComponent={ErrorFallback}
                    >
                        <Suspense fallback={<SkeletonText />}>
                            <Releases runner={runner} />
                        </Suspense>
                    </ErrorBoundary>
                )}
            </Content>
        </Modal>
    );
};
