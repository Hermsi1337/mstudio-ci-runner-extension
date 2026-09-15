import {
    AccentBox,
    Badge,
    Button,
    Flex,
    Heading,
    Image,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import logo from "@/assets/logo.svg?inline";
import { ChangelogModal } from "@/components/ChangelogModal.tsx";
import { ChangelogClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";

const ChangelogAction = () => {
    const t = useTranslation();
    const controller = useOverlayController("Modal", {
        reuseControllerFromContext: false,
    });
    const { value: changelog } = ChangelogClientGhost.getChangelog(
        {},
    ).useGhost();
    return (
        <Flex align="center" gap="xs" wrap="wrap">
            {changelog.updateAvailable && changelog.latestVersion && (
                <Badge color="blue">
                    {t("changelog.updateAvailable", {
                        version: changelog.latestVersion,
                    })}
                </Badge>
            )}
            <Button color="secondary" variant="soft" onPress={controller.open}>
                {t("changelog.action")}
            </Button>
            <ChangelogModal changelog={changelog} controller={controller} />
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
        <AccentBox backgroundColor="gradient">
            <Flex align="center" gap="l" wrap="wrap" justify="space-between">
                <Flex align="center" gap="l" wrap="wrap">
                    <Image src={logo} alt="" width={72} height={72} />
                    <Flex direction="column" gap="xs">
                        <Heading level={2}>{t("brand.heading")}</Heading>
                        <Text>{t("brand.tagline")}</Text>
                        <Flex gap="xs" wrap="wrap">
                            <Badge>{t("provider.github")}</Badge>
                            <Badge>{t("provider.gitlab")}</Badge>
                            <Badge>{t("brand.openSource")}</Badge>
                        </Flex>
                    </Flex>
                </Flex>
                <ErrorBoundary fallbackRender={() => null}>
                    <Suspense fallback={null}>
                        <ChangelogAction />
                    </Suspense>
                </ErrorBoundary>
            </Flex>
        </AccentBox>
    );
};
