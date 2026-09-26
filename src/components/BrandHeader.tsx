import {
    AccentBox,
    Badge,
    Button,
    Flex,
    Heading,
    Image,
    LayoutCard,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import logo from "@/assets/logo.svg?inline";
import { ChangelogModal } from "@/components/ChangelogModal.tsx";
import { ChangelogClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";

/**
 * The version is plain information: the maintainer deploys the extension,
 * users cannot update it. Runners carry their own update hint in the list.
 */
const VersionBadge = () => {
    const { value: changelog } = ChangelogClientGhost.getChangelog(
        {},
    ).useGhost();
    return <Badge>v{changelog.currentVersion}</Badge>;
};

/**
 * Only the badge needs the changelog, so only it sits behind the boundary
 * that hides it on a failed request. The button stays, and the modal
 * reports the failure with its own retry.
 */
const ChangelogAction = () => {
    const t = useTranslation();
    const controller = useOverlayController("Modal", {
        reuseControllerFromContext: false,
    });
    return (
        <Flex align="center" gap="xs" wrap="wrap">
            <ErrorBoundary fallbackRender={() => null}>
                <Suspense fallback={null}>
                    <VersionBadge />
                </Suspense>
            </ErrorBoundary>
            <Button color="secondary" variant="soft" onPress={controller.open}>
                {t("changelog.action")}
            </Button>
            <ChangelogModal controller={controller} />
        </Flex>
    );
};

/**
 * The logo is inlined as a data URI because the remote UI renders inside
 * mStudio, where relative asset URLs would point at the wrong host. The
 * background uses Flow's navy token, which adapts to the light and the dark
 * theme of mStudio.
 */
export const BrandHeader = () => {
    const t = useTranslation();
    return (
        <LayoutCard>
            <AccentBox backgroundColor="gradient">
                <Flex
                    align="center"
                    gap="l"
                    wrap="wrap"
                    justify="space-between"
                >
                    <Flex align="center" gap="l" wrap="wrap">
                        <Image src={logo} alt="" width={72} height={72} />
                        <Flex direction="column" gap="xs">
                            <Heading level={2}>{t("brand.heading")}</Heading>
                            <Text>{t("brand.tagline")}</Text>
                            <Flex gap="xs" wrap="wrap">
                                <Badge>{t("provider.github")}</Badge>
                                <Badge>{t("provider.gitlab")}</Badge>
                                <Badge>{t("provider.forgejo")}</Badge>
                                <Badge>{t("brand.openSource")}</Badge>
                            </Flex>
                        </Flex>
                    </Flex>
                    <ChangelogAction />
                </Flex>
            </AccentBox>
        </LayoutCard>
    );
};
