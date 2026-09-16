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
import { CacheFields, type CacheFormValues } from "./CacheFields.tsx";
import {
    ConcurrencyField,
    type ConcurrencyFormValues,
} from "./ConcurrencyField.tsx";
import {
    ImageBuildsField,
    type ImageBuildsFormValues,
} from "./ImageBuildsField.tsx";
import { ResourceFields, type ResourceFormValues } from "./ResourceFields.tsx";

type FormValues = CacheFormValues &
    ImageBuildsFormValues &
    ConcurrencyFormValues &
    ResourceFormValues;

function pipelineSnippet(runner: Runner): string | null {
    if (runner.labels.length === 0) {
        return null;
    }
    const list = runner.labels.map((label) => `"${label}"`).join(", ");
    return runner.provider === "github"
        ? `jobs:\n  build:\n    runs-on: [self-hosted, ${list}]\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci && npm test`
        : `build:\n  tags: [${list}]\n  script:\n    - npm ci && npm test`;
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
                <Section>
                    <Heading>{t("form.section.resources")}</Heading>
                    <ResourceFields
                        form={form}
                        description={
                            runner.provider === "github"
                                ? t("form.concurrency.github")
                                : t("form.size.description")
                        }
                    />
                    {runner.provider === "gitlab" && (
                        <ConcurrencyField
                            form={form}
                            size={form.watch("size")}
                        />
                    )}
                </Section>
                <Section>
                    <Heading>{t("form.section.cache")}</Heading>
                    <CacheFields form={form} />

                    <ImageBuildsField form={form} />
                </Section>
                {changed && (
                    <Alert status="warning">
                        <Heading>{t("form.configure.warning.heading")}</Heading>
                        <Text>{t("form.configure.warning.text")}</Text>
                    </Alert>
                )}
                <RootError />
                {snippet && (
                    <Section>
                        <Heading>{t("form.snippet.heading")}</Heading>
                        <Text>{t(`form.snippet.text.${runner.provider}`)}</Text>
                        <CodeBlock code={snippet} language="yaml" copyable />
                    </Section>
                )}
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
