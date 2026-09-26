import {
    Flex,
    Heading,
    IconContainer,
    IconCronjob,
    IconProject,
    IconVolume,
    Label,
    LabeledValue,
    Section,
    Text,
} from "@mittwald/flow-remote-react-components";
import type { ReactNode } from "react";
import type { Provider, RunnerSize } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import { runnerSizes, toMemoryGb } from "@/runner-sizes.ts";

interface CreatedResourcesProps {
    provider: Provider;
    name: string;
    target: string;
    size: RunnerSize;
    cpus: number;
    memoryGb: number;
    cache: boolean;
    cacheSizeGb: number;
    imageBuilds: boolean;
    dockerApi: boolean;
    selectedStackName?: string;
}

/**
 * mittwald volumes carry no description, so the create form explains every
 * resource the runner gets in the project before the user creates it. The
 * service name mirrors slugify() in the domain.
 */
export const CreatedResources = ({
    provider,
    name,
    target,
    size,
    cpus,
    memoryGb,
    cache,
    cacheSizeGb,
    imageBuilds,
    dockerApi,
    selectedStackName,
}: CreatedResourcesProps) => {
    const t = useTranslation();
    const serviceName = `runner-${
        name
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "…"
    }`;
    const limits =
        size === "custom"
            ? { cpus, memoryGb }
            : {
                  cpus: runnerSizes[size].cpus,
                  memoryGb: toMemoryGb(runnerSizes[size].memoryMb),
              };
    const items: {
        key: string;
        icon: ReactNode;
        label: string;
        text: string;
    }[] = [
        {
            key: "stack",
            icon: <IconProject />,
            label: selectedStackName
                ? t("form.summary.stack.selected.label", {
                      name: selectedStackName,
                  })
                : t("form.summary.stack.label", { target: target || "…" }),
            text: selectedStackName
                ? t("form.summary.stack.selected.text")
                : t("form.summary.stack.text"),
        },
        {
            key: "service",
            icon: <IconContainer />,
            label: t("form.summary.service.label", { service: serviceName }),
            text: t("form.summary.service.text", {
                cpus: limits.cpus,
                memory: limits.memoryGb,
            }),
        },
        {
            key: "data",
            icon: <IconVolume />,
            label: t("form.summary.dataVolume.label", { service: serviceName }),
            text: t(`form.summary.dataVolume.text.${provider}`),
        },
        ...(cache
            ? [
                  {
                      key: "cache",
                      icon: <IconVolume />,
                      label: t("form.summary.cacheVolume.label", {
                          service: serviceName,
                      }),
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
        ...(imageBuilds
            ? [
                  {
                      key: "builder",
                      icon: <IconContainer />,
                      label: t("form.summary.builder.label"),
                      text: t("form.summary.builder.text"),
                  },
              ]
            : []),
        ...(dockerApi
            ? [
                  {
                      key: "docker",
                      icon: <IconContainer />,
                      label: t("form.summary.dockerApi.label"),
                      text: t("form.summary.dockerApi.text"),
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
