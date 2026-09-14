import {
    AccentBox,
    ColumnLayout,
    Content,
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

const REPOSITORY_URL =
    "https://github.com/Hermsi1337/mstudio-ci-runner-extension";

/**
 * Three tiles, one per way to reach the project. Tiles instead of a link row
 * so the card reads as an offer, not as a footer.
 */
export const FeedbackCard = () => {
    const t = useTranslation();
    const tiles: {
        key: string;
        icon: ReactNode;
        color: "blue" | "green" | "neutral";
        heading: string;
        text: string;
        link: string;
        href: string;
    }[] = [
        {
            key: "issue",
            icon: <IconTicket />,
            color: "blue",
            heading: t("feedback.issue.heading"),
            text: t("feedback.issue.text"),
            link: t("feedback.issue.link"),
            href: `${REPOSITORY_URL}/issues/new/choose`,
        },
        {
            key: "question",
            icon: <IconSupport />,
            color: "green",
            heading: t("feedback.question.heading"),
            text: t("feedback.question.text"),
            link: t("feedback.question.link"),
            href: `${REPOSITORY_URL}/discussions`,
        },
        {
            key: "code",
            icon: <IconCode />,
            color: "neutral",
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
                        <AccentBox key={tile.key} color={tile.color}>
                            {tile.icon}
                            <Content>
                                <Heading level={4}>{tile.heading}</Heading>
                                <Text>{tile.text}</Text>
                                <Link href={tile.href} target="_blank">
                                    {tile.link}
                                </Link>
                            </Content>
                        </AccentBox>
                    ))}
                </ColumnLayout>
            </Section>
        </LayoutCard>
    );
};
