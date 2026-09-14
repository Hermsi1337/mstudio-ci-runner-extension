import {
    Flex,
    Heading,
    IconContainer,
    IconCronjob,
    IconVolume,
    Label,
    LabeledValue,
    Section,
    Text,
} from "@mittwald/flow-remote-react-components";
import type { ReactNode } from "react";
import type { Provider } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";

interface CreatedResourcesProps {
    provider: Provider;
    name: string;
    cache: boolean;
    cacheSizeGb: number;
}

/**
 * mittwald volumes carry no description, so the create form explains every
 * resource the runner gets in the project before the user creates it.
 */
export const CreatedResources = ({
    provider,
    name,
    cache,
    cacheSizeGb,
}: CreatedResourcesProps) => {
    const t = useTranslation();
    const items: {
        key: string;
        icon: ReactNode;
        label: string;
        text: string;
    }[] = [
        {
            key: "stack",
            icon: <IconContainer />,
            label: t("form.summary.stack.label", {
                provider,
                name: name || "…",
            }),
            text: t("form.summary.stack.text"),
        },
        {
            key: "runner-data",
            icon: <IconVolume />,
            label: t("form.summary.dataVolume.label"),
            text: t(`form.summary.dataVolume.text.${provider}`),
        },
        ...(cache
            ? [
                  {
                      key: "tool-cache",
                      icon: <IconVolume />,
                      label: t("form.summary.cacheVolume.label"),
                      text: t("form.summary.cacheVolume.text"),
                  },
                  {
                      key: "cronjob",
                      icon: <IconCronjob />,
                      label: t("form.summary.cronjob.label"),
                      text: t("form.summary.cronjob.text", {
                          size: cacheSizeGb,
                      }),
                  },
              ]
            : []),
    ];

    return (
        <Section>
            <Heading level={4}>{t("form.summary.heading")}</Heading>
            {items.map((item) => (
                <Flex key={item.key} align="start" gap="s">
                    {item.icon}
                    <LabeledValue>
                        <Label>{item.label}</Label>
                        <Text key={item.text}>{item.text}</Text>
                    </LabeledValue>
                </Flex>
            ))}
        </Section>
    );
};
