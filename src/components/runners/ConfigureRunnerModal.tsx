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
import { useForm } from "react-hook-form";
import type { Runner } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useNotify } from "@/hooks/useNotify.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { toMemoryGb, toMemoryMb } from "@/runner-sizes.ts";
import {
    ConcurrencyField,
    type ConcurrencyFormValues,
    concurrentProviders,
} from "./ConcurrencyField.tsx";
import {
    JobFeatureFields,
    type JobFeatureFormValues,
} from "./JobFeatureFields.tsx";
import { ResourceFields, type ResourceFormValues } from "./ResourceFields.tsx";

type FormValues = JobFeatureFormValues &
    ConcurrencyFormValues &
    ResourceFormValues;

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
            cache: runner.cache,
            cacheSizeGb: runner.cacheSizeGb,
            imageBuilds: runner.imageBuilds,
            dockerApi: runner.dockerApi,
            concurrency: runner.concurrency,
            size: runner.size,
            cpus: runner.cpus,
            memoryGb: toMemoryGb(runner.memoryMb),
        },
    });
    const [RootError, handleSubmit] = useFormErrorHandling(
        form,
        async (values) => {
            await RunnerClientGhost.configureRunner({
                data: {
                    runnerId: runner.id,
                    cache: values.cache,
                    cacheSizeGb: values.cacheSizeGb,
                    imageBuilds: values.imageBuilds,
                    dockerApi: values.dockerApi,
                    concurrency: values.concurrency,
                    size: values.size,
                    cpus: values.size === "custom" ? values.cpus : undefined,
                    memoryMb:
                        values.size === "custom"
                            ? toMemoryMb(values.memoryGb)
                            : undefined,
                },
            });
            RunnerClientGhost.listRunners().invalidate(queryClient);
            notify(
                "success",
                t("runners.notice.configured", { name: runner.name }),
            );
            modal.close();
        },
    );
    const changed = form.formState.isDirty;
    const snippet = pipelineSnippet(runner);

    return (
        <Form form={form} onSubmit={handleSubmit}>
            <Content>
                <Tabs>
                    <Tab>
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
                    <Tab>
                        <TabTitle>{t("form.section.features")}</TabTitle>
                        <Section>
                            <JobFeatureFields form={form} />
                        </Section>
                    </Tab>
                    {snippet && (
                        <Tab>
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
                {changed && (
                    <Alert status="warning">
                        <Heading>{t("form.configure.warning.heading")}</Heading>
                        <Text>{t("form.configure.warning.text")}</Text>
                    </Alert>
                )}
                <RootError />
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
