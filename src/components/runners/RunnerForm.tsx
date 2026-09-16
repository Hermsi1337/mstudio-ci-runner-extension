import {
    AccentBox,
    ActionGroup,
    Button,
    ColumnLayout,
    Content,
    FieldDescription,
    Flex,
    Heading,
    Image,
    Label,
    Section,
    TextArea,
    TextField,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import {
    Form,
    SubmitButton,
    typedField,
} from "@mittwald/flow-remote-react-components/react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import type {
    CreateRunnerRequest,
    Provider,
    RunnerSize,
} from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useNotify } from "@/hooks/useNotify.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { toMemoryMb } from "@/runner-sizes.ts";
import { CacheFields } from "./CacheFields.tsx";
import { ConcurrencyField } from "./ConcurrencyField.tsx";
import { CreatedResources } from "./CreatedResources.tsx";
import { FieldHelp } from "./FieldHelp.tsx";
import { ImageBuildsField } from "./ImageBuildsField.tsx";
import { ParsedCommand } from "./ParsedCommand.tsx";
import { parseConfigCommand } from "./parseConfigCommand.ts";
import { providerLogos } from "./provider-logos.ts";
import { ResourceFields } from "./ResourceFields.tsx";
import {
    AUTOMATIC_STACK,
    StackField,
    useProjectStacks,
} from "./StackField.tsx";

/**
 * Mirrors zRunnerBase.name from src/generated/extension-api/zod.gen.ts. The
 * server rejects the same values, but only in English and only after the
 * request, so the form checks them first. Keep both in sync when the spec
 * changes.
 */
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 64;

interface FormValues {
    provider: Provider;
    name: string;
    labels: string;
    size: RunnerSize;
    cpus: number;
    memoryGb: number;
    cache: boolean;
    cacheSizeGb: number;
    imageBuilds: boolean;
    concurrency: number;
    configCommand: string;
    runnerGroup: string;
    stackId: string;
}

function toRequest(values: FormValues): CreateRunnerRequest {
    const base = {
        name: values.name,
        labels: values.labels,
        stackId:
            values.stackId === AUTOMATIC_STACK ? undefined : values.stackId,
        size: values.size,
        cpus: values.size === "custom" ? values.cpus : undefined,
        memoryMb:
            values.size === "custom" ? toMemoryMb(values.memoryGb) : undefined,
        cache: values.cache,
        cacheSizeGb: values.cacheSizeGb,
        imageBuilds: values.imageBuilds,
        concurrency: values.concurrency,
    };
    if (values.provider === "gitlab") {
        const parsed = parseConfigCommand("gitlab", values.configCommand);
        return {
            ...base,
            provider: "gitlab",
            tokenType: "registration",
            instanceUrl: parsed?.target ?? "",
            token: parsed?.token ?? "",
        };
    }
    const parsed = parseConfigCommand("github", values.configCommand);
    return {
        ...base,
        provider: "github",
        target: parsed?.target ?? "",
        tokenType: "registration",
        token: parsed?.token ?? "",
        runnerGroup: values.runnerGroup || undefined,
    };
}

function suggestName(provider: Provider, target: string): string {
    const path = target.replace(/^https?:\/\/[^/]+\/?/, "");
    return (provider === "github" ? path : "gitlab").replace(/\//g, "-");
}

export const RunnerForm = ({
    initialProvider,
    onChangeProvider,
}: {
    initialProvider: Provider;
    onChangeProvider: () => void;
}) => {
    const t = useTranslation();
    const queryClient = useQueryClient();
    const modal = useOverlayController("Modal");
    const { notify } = useNotify();

    const form = useForm<FormValues>({
        mode: "onBlur",
        defaultValues: {
            provider: initialProvider,
            name: "",
            labels: "mittwald",
            size: "medium",
            cpus: 1,
            memoryGb: 2,
            cache: false,
            cacheSizeGb: 10,
            imageBuilds: false,
            concurrency: 1,
            configCommand: "",
            runnerGroup: "",
            stackId: AUTOMATIC_STACK,
        },
    });
    const Field = typedField(form);
    const stacks = useProjectStacks();
    const provider = form.watch("provider");
    const name = form.watch("name");
    const size = form.watch("size");
    const cpus = form.watch("cpus");
    const memoryGb = form.watch("memoryGb");
    const cache = form.watch("cache");
    const cacheSizeGb = form.watch("cacheSizeGb");
    const imageBuilds = form.watch("imageBuilds");
    const configCommand = form.watch("configCommand");
    const stackId = form.watch("stackId");
    const selectedStack = stacks.find((stack) => stack.id === stackId);
    const summaryTarget = (
        parseConfigCommand(provider, configCommand)?.target ?? ""
    ).replace(/^https?:\/\/(github\.com\/)?/, "");

    useEffect(() => {
        if (provider !== "github") {
            return;
        }
        const parsed = parseConfigCommand(provider, configCommand);
        if (parsed && !form.getFieldState("name").isDirty) {
            form.setValue("name", suggestName(provider, parsed.target));
        }
    }, [provider, configCommand, form]);

    const [RootError, handleSubmit] = useFormErrorHandling(
        form,
        async (values) => {
            const created = await RunnerClientGhost.createRunner({
                data: toRequest(values),
            });
            RunnerClientGhost.listRunners().invalidate(queryClient);
            notify(
                "success",
                t("runners.notice.created", { name: created.name }),
                t("runners.notice.createdText"),
            );
            modal.close();
        },
    );

    return (
        <Form form={form} onSubmit={handleSubmit}>
            <ColumnLayout>
                <Content>
                    <Section>
                        <Flex align="center" gap="m" wrap="wrap">
                            <Image
                                src={providerLogos[provider]}
                                alt=""
                                width={28}
                                height={28}
                            />
                            <Heading level={4}>
                                {t(`provider.${provider}`)}
                            </Heading>
                            <Button
                                color="secondary"
                                variant="plain"
                                onPress={onChangeProvider}
                            >
                                {t("form.provider.change")}
                            </Button>
                        </Flex>

                        {provider === "github" && (
                            <>
                                <Field
                                    name="configCommand"
                                    rules={{
                                        required: t(
                                            "form.github.configCommand.required",
                                        ),
                                        validate: (value) =>
                                            parseConfigCommand(
                                                "github",
                                                String(value),
                                            )
                                                ? true
                                                : t(
                                                      "form.github.configCommand.invalid",
                                                  ),
                                    }}
                                >
                                    <TextArea
                                        rows={3}
                                        placeholder="./config.sh --url https://github.com/owner/repo --token AEBIHM56SBF3SULYYYY3BH3KU333M"
                                    >
                                        <Label>
                                            {t(
                                                "form.github.configCommand.label",
                                            )}
                                            <FieldHelp
                                                subject={t(
                                                    "form.github.configCommand.label",
                                                )}
                                                text={t(
                                                    "form.github.configCommand.help",
                                                )}
                                            />
                                        </Label>
                                        <FieldDescription>
                                            {t(
                                                "form.github.configCommand.description",
                                            )}
                                        </FieldDescription>
                                    </TextArea>
                                </Field>
                                <ParsedCommand
                                    provider="github"
                                    command={configCommand}
                                />
                                <Field name="runnerGroup">
                                    <TextField>
                                        <Label>
                                            {t("form.github.runnerGroup.label")}
                                            <FieldHelp
                                                subject={t(
                                                    "form.github.runnerGroup.label",
                                                )}
                                                text={t(
                                                    "form.github.runnerGroup.help",
                                                )}
                                            />
                                        </Label>
                                    </TextField>
                                </Field>
                            </>
                        )}

                        {provider === "gitlab" && (
                            <>
                                <Field
                                    name="configCommand"
                                    rules={{
                                        required: t(
                                            "form.gitlab.configCommand.required",
                                        ),
                                        validate: (value) =>
                                            parseConfigCommand(
                                                "gitlab",
                                                String(value),
                                            )
                                                ? true
                                                : t(
                                                      "form.gitlab.configCommand.invalid",
                                                  ),
                                    }}
                                >
                                    <TextArea
                                        rows={3}
                                        placeholder="gitlab-runner register --url https://gitlab.com --token glrt-t1_AbCdEfGhIjKlMnOpQrSt"
                                    >
                                        <Label>
                                            {t(
                                                "form.gitlab.configCommand.label",
                                            )}
                                            <FieldHelp
                                                subject={t(
                                                    "form.gitlab.configCommand.label",
                                                )}
                                                text={t(
                                                    "form.gitlab.configCommand.help",
                                                )}
                                            />
                                        </Label>
                                        <FieldDescription>
                                            {t(
                                                "form.gitlab.configCommand.description",
                                            )}
                                        </FieldDescription>
                                    </TextArea>
                                </Field>
                                <ParsedCommand
                                    provider="gitlab"
                                    command={configCommand}
                                />
                            </>
                        )}
                    </Section>

                    <Section>
                        <Heading>{t("form.section.runner")}</Heading>
                        <Field
                            name="name"
                            rules={{
                                required: t("form.name.required"),
                                minLength: {
                                    value: NAME_MIN_LENGTH,
                                    message: t("form.name.tooShort"),
                                },
                                maxLength: {
                                    value: NAME_MAX_LENGTH,
                                    message: t("form.name.tooLong"),
                                },
                            }}
                        >
                            <TextField>
                                <Label>
                                    {t("form.name.label")}
                                    <FieldHelp
                                        subject={t("form.name.label")}
                                        text={t("form.name.help")}
                                    />
                                </Label>
                                <FieldDescription>
                                    {t("form.name.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        {provider !== "gitlab" && (
                            <Field name="labels">
                                <TextField>
                                    <Label>
                                        {t("form.labels.label")}
                                        <FieldHelp
                                            subject={t("form.labels.label")}
                                            text={t("form.labels.help")}
                                        />
                                    </Label>
                                    <FieldDescription>
                                        {t("form.labels.description")}
                                    </FieldDescription>
                                </TextField>
                            </Field>
                        )}
                        <StackField form={form} stacks={stacks} />
                    </Section>

                    <Section>
                        <Heading>{t("form.section.resources")}</Heading>
                        <ResourceFields
                            form={form}
                            description={
                                provider === "github"
                                    ? t("form.concurrency.github")
                                    : t("form.size.description")
                            }
                        />

                        {provider === "gitlab" && (
                            <ConcurrencyField form={form} size={size} />
                        )}

                        <CacheFields form={form} />

                        <ImageBuildsField form={form} />
                    </Section>

                    <RootError />
                </Content>

                <AccentBox>
                    <CreatedResources
                        provider={provider}
                        name={name}
                        target={summaryTarget}
                        size={size}
                        cpus={cpus}
                        memoryGb={memoryGb}
                        cache={cache}
                        cacheSizeGb={cacheSizeGb}
                        imageBuilds={imageBuilds}
                        selectedStackName={selectedStack?.description}
                    />
                </AccentBox>
            </ColumnLayout>

            <ActionGroup>
                <SubmitButton color="primary">
                    {t("form.create.button")}
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
