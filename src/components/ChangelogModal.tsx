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
    Text,
} from "@mittwald/flow-remote-react-components";
import type { Changelog } from "@/generated/extension-api";
import { useLocale, useTranslation } from "@/i18n/react.tsx";

export const ChangelogModal = ({
    changelog,
    controller,
}: {
    changelog: Changelog;
    controller: OverlayController;
}) => {
    const t = useTranslation();
    const locale = useLocale();
    return (
        <Modal offCanvas size="m" controller={controller}>
            <Heading>{t("changelog.heading")}</Heading>
            <Content>
                {changelog.releases.length === 0 && (
                    <IllustratedMessage>
                        <IconChangelog />
                        <Heading>{t("changelog.empty.heading")}</Heading>
                        <Text>{t("changelog.empty.text")}</Text>
                    </IllustratedMessage>
                )}
                {changelog.releases.map((release) => (
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
            </Content>
        </Modal>
    );
};
