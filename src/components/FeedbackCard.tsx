import {
    AccentBox,
    ColumnLayout,
    Flex,
    Heading,
    IconCode,
    IconSupport,
    IconTicket,
    LayoutCard,
    Link,
    Section,
    Text,
} from "@mittwald/flow-remote-react-components";
import type { ReactNode } from "react";
import { useTranslation } from "@/i18n/react.tsx";
import { REPOSITORY_URL } from "@/repository.ts";

/**
 * Three tiles, one per way to reach the project. Tiles instead of a link row
 * so the card reads as an offer, not as a footer.
 */
export const FeedbackCard = () => {
    const t = useTranslation();
    const tiles: {
        key: string;
        icon: ReactNode;
        heading: string;
        text: string;
        link: string;
        href: string;
    }[] = [
        {
            key: "issue",
            icon: <IconTicket />,
            heading: t("feedback.issue.heading"),
            text: t("feedback.issue.text"),
            link: t("feedback.issue.link"),
            href: `${REPOSITORY_URL}/issues/new/choose`,
        },
        {
            key: "question",
            icon: <IconSupport />,
            heading: t("feedback.question.heading"),
            text: t("feedback.question.text"),
            link: t("feedback.question.link"),
            href: `${REPOSITORY_URL}/discussions`,
        },
        {
            key: "code",
            icon: <IconCode />,
            heading: t("feedback.code.heading"),
            text: t("feedback.code.text"),
            link: t("feedback.code.link"),
            href: REPOSITORY_URL,
        },
    ];

    return (
        <LayoutCard>
            <Section>
                <Heading>{t("feedback.heading")}</Heading>
                <Text>{t("feedback.text")}</Text>
                <ColumnLayout s={[1]} m={[1, 1, 1]}>
                    {tiles.map((tile) => (
                        <AccentBox key={tile.key} backgroundColor="neutral">
                            {tile.icon}
                            <Flex direction="column" gap="s">
                                <Heading level={4}>{tile.heading}</Heading>
                                <Text>{tile.text}</Text>
                                <Link href={tile.href} target="_blank">
                                    {tile.link}
                                </Link>
                            </Flex>
                        </AccentBox>
                    ))}
                </ColumnLayout>
            </Section>
        </LayoutCard>
    );
};
