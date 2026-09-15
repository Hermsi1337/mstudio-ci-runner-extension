import {
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
import { ChangelogClientGhost } from "@/ghosts.ts";
import { useLocale, useTranslation } from "@/i18n/react.tsx";
import { versionsSince } from "@/version-compare.ts";

const Releases = ({ sinceVersion }: { sinceVersion?: string | null }) => {
    const t = useTranslation();
    const locale = useLocale();
    const { value: changelog } = ChangelogClientGhost.getChangelog(
        {},
    ).useGhost();
    const visible = sinceVersion
        ? changelog.releases.filter(
              (release) =>
                  versionsSince([release.version], sinceVersion).length > 0,
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
                        {release.version === changelog.currentVersion && (
                            <Badge color="blue">
                                {t("changelog.installed")}
                            </Badge>
                        )}
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
    sinceVersion,
}: {
    controller: OverlayController;
    sinceVersion?: string | null;
}) => {
    const t = useTranslation();
    const { reset } = useQueryErrorResetBoundary();
    const isOpen = controller.useIsOpen();
    return (
        <Modal offCanvas size="m" controller={controller}>
            <Heading>
                {sinceVersion
                    ? t("changelog.since.heading", { version: sinceVersion })
                    : t("changelog.heading")}
            </Heading>
            <Content>
                {isOpen && (
                    <ErrorBoundary
                        onReset={reset}
                        FallbackComponent={ErrorFallback}
                    >
                        <Suspense fallback={<SkeletonText />}>
                            <Releases sinceVersion={sinceVersion} />
                        </Suspense>
                    </ErrorBoundary>
                )}
            </Content>
        </Modal>
    );
};
