import {
    AccentBox,
    Badge,
    Flex,
    Heading,
    Image,
    Text,
} from "@mittwald/flow-remote-react-components";
import logo from "@/assets/logo.svg?inline";
import { useTranslation } from "@/i18n/react.tsx";

/**
 * The logo is inlined as a data URI because the remote UI renders inside
 * mStudio, where relative asset URLs would point at the wrong host. The
 * background is the navy of the logo, so the header reads the same in the
 * light and the dark theme of mStudio.
 */
export const BrandHeader = () => {
    const t = useTranslation();
    return (
        <AccentBox backgroundColor="#0f2a6b" color="light">
            <Flex align="center" gap="l" wrap="wrap">
                <Image src={logo} alt="" width={72} height={72} />
                <Flex direction="column" gap="xs">
                    <Heading level={2}>{t("brand.heading")}</Heading>
                    <Text>{t("brand.tagline")}</Text>
                    <Flex gap="xs" wrap="wrap">
                        <Badge color="light">{t("provider.github")}</Badge>
                        <Badge color="light">{t("provider.gitlab")}</Badge>
                        <Badge color="light">{t("brand.openSource")}</Badge>
                    </Flex>
                </Flex>
            </Flex>
        </AccentBox>
    );
};
