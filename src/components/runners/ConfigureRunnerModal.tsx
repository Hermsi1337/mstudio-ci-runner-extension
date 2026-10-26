import {
    ActionGroup,
    Alert,
    Button,
    CodeBlock,
    Content,
    Heading,
    Modal,
    type OverlayController,
    Section,
    Tab,
    Tabs,
    TabTitle,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import {
    Form,
    SubmitButton,
} from "@mittwald/flow-remote-react-components/react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import type { Runner } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useNotify } from "@/hooks/useNotify.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import {
    ConcurrencyField,
    type ConcurrencyFormValues,
    concurrentProviders,
} from "./ConcurrencyField.tsx";
import {
    JobFeatureFields,
    type JobFeatureFormValues,
} from "./JobFeatureFields.tsx";
import { NameField, type NameFormValues } from "./NameField.tsx";
import {
    ProjectDirectoryFields,
    type ProjectDirectoryFormValues,
} from "./ProjectDirectoryFields.tsx";
import { ResourceFields } from "./ResourceFields.tsx";
import {
    type ResourceFormValues,
    toResourceFormValues,
    toResourceRequest,
} from "./resource-request.ts";

type FormValues = NameFormValues &
    JobFeatureFormValues &
    ConcurrencyFormValues &
    ResourceFormValues &
    ProjectDirectoryFormValues;

/** Mirrors configureRunner: these fields change the service without a recreate. */
const KEEPS_CONTAINER: readonly (keyof FormValues)[] = ["name"];

function pipelineSnippet(runner: Runner): string | null {
    if (runner.labels.length === 0) {
        return null;
    }
    const list = runner.labels.map((label) => `"${label}"`).join(", ");
    switch (runner.provider) {
        case "github":
            return `jobs:\n  build:\n    runs-on: [self-hosted, ${list}]\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci && npm test`;
        case "forgejo":
            return `jobs:\n  build:\n    runs-on: ${runner.labels.length > 1 ? `[${list}]` : list}\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci && npm test`;
        case "gitlab":
            return `build:\n  tags: [${list}]\n  script:\n    - npm ci && npm test`;
    }
}

const ConfigureRunnerForm = ({ runner }: { runner: Runner }) => {
    const t = useTranslation();
    const queryClient = useQueryClient();
    const modal = useOverlayController("Modal");
    const { notify } = useNotify();
    const form = useForm<FormValues>({
        defaultValues: {
            name: runner.name,
            cache: runner.cache,
            cacheSizeGb: runner.cacheSizeGb,
            imageBuilds: runner.imageBuilds,
            dockerApi: runner.dockerApi,
            concurrency: runner.concurrency,
            projectDirectories: runner.projectDirectories,
            ...toResourceFormValues(runner),
        },
    });
    const [rootError, handleSubmit] = useFormErrorHandling(
        form,
        async (values) => {
            const configured = await RunnerClientGhost.configureRunner({
                data: {
                    runnerId: runner.id,
                    name: values.name,
                    cache: values.cache,
                    cacheSizeGb: values.cacheSizeGb,
                    imageBuilds: values.imageBuilds,
                    dockerApi: values.dockerApi,
                    concurrency: values.concurrency,
                    projectDirectories: values.projectDirectories,
                    ...toResourceRequest(values),
                },
            });
            RunnerClientGhost.listRunners().invalidate(queryClient);
            notify(
                "success",
                t("runners.notice.configured", { name: configured.name }),
            );
            modal.close();
        },
    );
    const changed = form.formState.isDirty;
    const recreates = (
        Object.keys(form.formState.dirtyFields) as (keyof FormValues)[]
    ).some((field) => !KEEPS_CONTAINER.includes(field));
    const snippet = pipelineSnippet(runner);
    const [selectedTab, setSelectedTab] = useState("runner");
    const directoriesInvalid = Boolean(
        form.formState.errors.projectDirectories,
    );
    const submitCount = form.formState.submitCount;

    // A tab hides the errors of the others, and the server checks directories
    // the form cannot (the work directory of Docker in jobs).
    useEffect(() => {
        if (directoriesInvalid && submitCount > 0) {
            setSelectedTab("directories");
        }
    }, [directoriesInvalid, submitCount]);

    return (
        <Form form={form} onSubmit={handleSubmit}>
            <Content>
                <Tabs
                    selectedKey={selectedTab}
                    onSelectionChange={(key) => setSelectedTab(String(key))}
                >
                    <Tab id="runner">
                        <TabTitle>{t("form.section.runner")}</TabTitle>
                        <Section>
                            <NameField
                                form={form}
                                description={t("form.rename.description")}
                                help={t("form.rename.help")}
                            />
                        </Section>
                    </Tab>
                    <Tab id="resources">
                        <TabTitle>{t("form.section.resources")}</TabTitle>
                        <Section>
                            <ResourceFields
                                form={form}
                                description={
                                    runner.provider === "github"
                                        ? t("form.concurrency.github")
                                        : t("form.size.description")
                                }
                            />
                            {concurrentProviders.includes(runner.provider) && (
                                <ConcurrencyField
                                    form={form}
                                    size={form.watch("size")}
                                />
                            )}
                        </Section>
                    </Tab>
                    <Tab id="features">
                        <TabTitle>{t("form.section.features")}</TabTitle>
                        <Section>
                            <JobFeatureFields form={form} />
                        </Section>
                    </Tab>
                    <Tab id="directories">
                        <TabTitle>{t("form.section.directories")}</TabTitle>
                        <ProjectDirectoryFields form={form} />
                    </Tab>
                    {snippet && (
                        <Tab id="snippet">
                            <TabTitle>{t("form.snippet.heading")}</TabTitle>
                            <Section>
                                <Text>
                                    {t(`form.snippet.text.${runner.provider}`)}
                                </Text>
                                <CodeBlock
                                    code={snippet}
                                    language="yaml"
                                    copyable
                                />
                            </Section>
                        </Tab>
                    )}
                </Tabs>
                {recreates && (
                    <Alert status="warning">
                        <Heading>{t("form.configure.warning.heading")}</Heading>
                        <Text>{t("form.configure.warning.text")}</Text>
                    </Alert>
                )}
                {rootError}
            </Content>
            <ActionGroup>
                <SubmitButton color="primary" isDisabled={!changed}>
                    {t("form.configure.button")}
                </SubmitButton>
                <Button
                    color="secondary"
                    variant="soft"
                    onPress={() => modal.close()}
                >
                    {t("form.cancel")}
                </Button>
            </ActionGroup>
        </Form>
    );
};

export const ConfigureRunnerModal = ({
    runner,
    controller,
}: {
    runner: Runner;
    controller: OverlayController;
}) => {
    const t = useTranslation();
    const isOpen = controller.useIsOpen();
    return (
        <Modal offCanvas size="m" controller={controller}>
            <Heading>
                {t("form.configure.heading", { name: runner.name })}
            </Heading>
            {isOpen && <ConfigureRunnerForm runner={runner} />}
        </Modal>
    );
};
