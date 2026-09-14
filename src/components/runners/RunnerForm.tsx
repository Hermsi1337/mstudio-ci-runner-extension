import {
    AccentBox,
    ActionGroup,
    Button,
    ColumnLayout,
    Content,
    FieldDescription,
    Flex,
    Heading,
    Label,
    Option,
    Section,
    Segment,
    SegmentedControl,
    Select,
    Switch,
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
    GitLabRunnerType,
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
import { ParsedCommand } from "./ParsedCommand.tsx";
import { parseConfigCommand } from "./parseConfigCommand.ts";
import { ResourceFields } from "./ResourceFields.tsx";

type TokenType = NonNullable<CreateRunnerRequest["tokenType"]>;

interface FormValues {
    provider: Provider;
    name: string;
    labels: string;
    size: RunnerSize;
    cpus: number;
    memoryGb: number;
    ephemeral: boolean;
    cache: boolean;
    cacheSizeGb: number;
    concurrency: number;
    tokenType: TokenType;
    configCommand: string;
    token: string;
    target: string;
    runnerGroup: string;
    instanceUrl: string;
    runnerType: GitLabRunnerType;
    runUntagged: boolean;
}

function toRequest(values: FormValues): CreateRunnerRequest {
    const base = {
        name: values.name,
        labels: values.labels,
        size: values.size,
        cpus: values.size === "custom" ? values.cpus : undefined,
        memoryMb:
            values.size === "custom" ? toMemoryMb(values.memoryGb) : undefined,
        cache: values.cache,
        cacheSizeGb: values.cacheSizeGb,
        concurrency: values.concurrency,
    };
    const parsed =
        values.tokenType === "registration"
            ? parseConfigCommand(values.provider, values.configCommand)
            : null;
    if (values.provider === "gitlab") {
        return {
            ...base,
            provider: "gitlab",
            tokenType: values.tokenType,
            instanceUrl: parsed?.target ?? values.instanceUrl,
            runnerType: values.runnerType,
            target: values.target || undefined,
            token: parsed?.token ?? values.token,
            runUntagged: values.runUntagged,
            ephemeral: false,
        };
    }
    return {
        ...base,
        provider: "github",
        target: parsed?.target ?? values.target,
        tokenType: values.tokenType,
        token: parsed?.token ?? values.token,
        runnerGroup: values.runnerGroup || undefined,
        ephemeral: values.tokenType === "pat" && values.ephemeral,
    };
}

function suggestName(provider: Provider, target: string): string {
    const path = target.replace(/^https?:\/\/[^/]+\/?/, "");
    return (provider === "github" ? path : "gitlab").replace(/\//g, "-");
}

export const RunnerForm = () => {
    const t = useTranslation();
    const queryClient = useQueryClient();
    const modal = useOverlayController("Modal");
    const { notify } = useNotify();

    const form = useForm<FormValues>({
        mode: "onBlur",
        defaultValues: {
            provider: "github",
            name: "",
            labels: "mittwald",
            size: "medium",
            cpus: 1,
            memoryGb: 2,
            ephemeral: false,
            cache: false,
            cacheSizeGb: 10,
            concurrency: 1,
            tokenType: "registration",
            configCommand: "",
            token: "",
            target: "",
            runnerGroup: "",
            instanceUrl: "https://gitlab.com",
            runnerType: "project_type",
            runUntagged: true,
        },
    });
    const Field = typedField(form);
    const provider = form.watch("provider");
    const tokenType = form.watch("tokenType");
    const name = form.watch("name");
    const size = form.watch("size");
    const cpus = form.watch("cpus");
    const memoryGb = form.watch("memoryGb");
    const cache = form.watch("cache");
    const cacheSizeGb = form.watch("cacheSizeGb");
    const runnerType = form.watch("runnerType");
    const instanceUrl = form.watch("instanceUrl").replace(/\/+$/, "");
    const configCommand = form.watch("configCommand");
    const target = form.watch("target");
    const parsedTarget =
        tokenType === "registration"
            ? parseConfigCommand(provider, configCommand)?.target
            : undefined;
    const summaryTarget = (
        parsedTarget ?? (provider === "github" ? target : instanceUrl)
    ).replace(/^https?:\/\//, "");

    useEffect(() => {
        if (provider !== "github" || tokenType !== "registration") {
            return;
        }
        const parsed = parseConfigCommand(provider, configCommand);
        if (parsed && !form.getFieldState("name").isDirty) {
            form.setValue("name", suggestName(provider, parsed.target));
        }
    }, [provider, tokenType, configCommand, form]);

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
                        <Field name="provider" rules={{ required: true }}>
                            <SegmentedControl>
                                <Label>
                                    {t("form.provider.label")}
                                    <FieldHelp
                                        subject={t("form.provider.label")}
                                        text={t("form.provider.help")}
                                    />
                                </Label>
                                <Segment value="github">
                                    {t("provider.github")}
                                </Segment>
                                <Segment value="gitlab">
                                    {t("provider.gitlab")}
                                </Segment>
                            </SegmentedControl>
                        </Field>

                        {provider === "github" && (
                            <>
                                <Field
                                    name="tokenType"
                                    rules={{ required: true }}
                                >
                                    <Select>
                                        <Label>
                                            {t("form.github.tokenType.label")}
                                            <FieldHelp
                                                subject={t(
                                                    "form.github.tokenType.label",
                                                )}
                                                text={t(
                                                    "form.github.tokenType.help",
                                                )}
                                            />
                                        </Label>
                                        <Option value="registration">
                                            {t(
                                                "form.github.tokenType.registration",
                                            )}
                                        </Option>
                                        <Option value="pat">
                                            {t("form.github.tokenType.pat")}
                                        </Option>
                                    </Select>
                                </Field>
                                {tokenType === "pat" ? (
                                    <>
                                        <Field
                                            name="target"
                                            rules={{
                                                required: t(
                                                    "form.github.target.required",
                                                ),
                                            }}
                                        >
                                            <TextField
                                                placeholder={t(
                                                    "form.github.target.placeholder",
                                                )}
                                            >
                                                <Label>
                                                    {t(
                                                        "form.github.target.label",
                                                    )}
                                                    <FieldHelp
                                                        subject={t(
                                                            "form.github.target.label",
                                                        )}
                                                        text={t(
                                                            "form.github.target.help",
                                                        )}
                                                    />
                                                </Label>
                                                <FieldDescription>
                                                    {t(
                                                        "form.github.target.description",
                                                    )}
                                                </FieldDescription>
                                            </TextField>
                                        </Field>
                                        <Field
                                            name="token"
                                            rules={{
                                                required: t(
                                                    "form.github.token.required",
                                                ),
                                            }}
                                        >
                                            <TextField type="password">
                                                <Label>
                                                    {t(
                                                        "form.github.token.label",
                                                    )}
                                                    <FieldHelp
                                                        subject={t(
                                                            "form.github.token.label",
                                                        )}
                                                        text={t(
                                                            "form.github.token.help",
                                                        )}
                                                        link={{
                                                            href: "https://github.com/settings/personal-access-tokens/new",
                                                            label: t(
                                                                "form.github.token.link",
                                                            ),
                                                        }}
                                                    />
                                                </Label>
                                                <FieldDescription>
                                                    {t(
                                                        "form.github.token.description",
                                                    )}
                                                </FieldDescription>
                                            </TextField>
                                        </Field>
                                    </>
                                ) : (
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
                                )}
                                {tokenType === "registration" && (
                                    <ParsedCommand
                                        provider="github"
                                        command={configCommand}
                                    />
                                )}
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
                                {tokenType === "pat" && (
                                    <Flex align="center" gap="xs">
                                        <Field name="ephemeral">
                                            <Switch>
                                                {t(
                                                    "form.github.ephemeral.label",
                                                )}
                                            </Switch>
                                        </Field>
                                        <FieldHelp
                                            subject={t(
                                                "form.github.ephemeral.label",
                                            )}
                                            text={t(
                                                "form.github.ephemeral.help",
                                            )}
                                        />
                                    </Flex>
                                )}
                            </>
                        )}

                        {provider === "gitlab" && (
                            <>
                                <Field
                                    name="tokenType"
                                    rules={{ required: true }}
                                >
                                    <Select>
                                        <Label>
                                            {t("form.gitlab.tokenType.label")}
                                            <FieldHelp
                                                subject={t(
                                                    "form.gitlab.tokenType.label",
                                                )}
                                                text={t(
                                                    "form.gitlab.tokenType.help",
                                                )}
                                            />
                                        </Label>
                                        <Option value="registration">
                                            {t(
                                                "form.gitlab.tokenType.registration",
                                            )}
                                        </Option>
                                        <Option value="pat">
                                            {t("form.gitlab.tokenType.pat")}
                                        </Option>
                                    </Select>
                                </Field>
                                {tokenType === "registration" ? (
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
                                ) : (
                                    <>
                                        <Field
                                            name="instanceUrl"
                                            rules={{
                                                required: t(
                                                    "form.gitlab.instanceUrl.required",
                                                ),
                                            }}
                                        >
                                            <TextField>
                                                <Label>
                                                    {t(
                                                        "form.gitlab.instanceUrl.label",
                                                    )}
                                                    <FieldHelp
                                                        subject={t(
                                                            "form.gitlab.instanceUrl.label",
                                                        )}
                                                        text={t(
                                                            "form.gitlab.instanceUrl.help",
                                                        )}
                                                    />
                                                </Label>
                                                <FieldDescription>
                                                    {t(
                                                        "form.gitlab.instanceUrl.description",
                                                    )}
                                                </FieldDescription>
                                            </TextField>
                                        </Field>
                                        <Field name="runnerType">
                                            <Select>
                                                <Label>
                                                    {t(
                                                        "form.gitlab.runnerType.label",
                                                    )}
                                                    <FieldHelp
                                                        subject={t(
                                                            "form.gitlab.runnerType.label",
                                                        )}
                                                        text={t(
                                                            "form.gitlab.runnerType.help",
                                                        )}
                                                    />
                                                </Label>
                                                <Option value="project_type">
                                                    {t(
                                                        "form.gitlab.runnerType.project",
                                                    )}
                                                </Option>
                                                <Option value="group_type">
                                                    {t(
                                                        "form.gitlab.runnerType.group",
                                                    )}
                                                </Option>
                                                <Option value="instance_type">
                                                    {t(
                                                        "form.gitlab.runnerType.instance",
                                                    )}
                                                </Option>
                                            </Select>
                                        </Field>
                                        {runnerType !== "instance_type" && (
                                            <Field
                                                name="target"
                                                rules={{
                                                    required: t(
                                                        "form.gitlab.path.required",
                                                    ),
                                                }}
                                            >
                                                <TextField
                                                    placeholder={t(
                                                        "form.gitlab.path.placeholder",
                                                    )}
                                                >
                                                    <Label>
                                                        {runnerType ===
                                                        "group_type"
                                                            ? t(
                                                                  "form.gitlab.groupPath.label",
                                                              )
                                                            : t(
                                                                  "form.gitlab.projectPath.label",
                                                              )}
                                                        <FieldHelp
                                                            subject={t(
                                                                "form.gitlab.projectPath.label",
                                                            )}
                                                            text={t(
                                                                "form.gitlab.path.help",
                                                            )}
                                                        />
                                                    </Label>
                                                </TextField>
                                            </Field>
                                        )}
                                        <Field
                                            name="token"
                                            rules={{
                                                required: t(
                                                    "form.gitlab.token.required",
                                                ),
                                            }}
                                        >
                                            <TextField type="password">
                                                <Label>
                                                    {t(
                                                        "form.gitlab.token.label",
                                                    )}
                                                    <FieldHelp
                                                        subject={t(
                                                            "form.gitlab.token.label",
                                                        )}
                                                        text={t(
                                                            "form.gitlab.token.help",
                                                        )}
                                                        link={{
                                                            href: `${instanceUrl}/-/user_settings/personal_access_tokens`,
                                                            label: t(
                                                                "form.gitlab.token.link",
                                                            ),
                                                        }}
                                                    />
                                                </Label>
                                                <FieldDescription>
                                                    {t(
                                                        "form.gitlab.token.description",
                                                    )}
                                                </FieldDescription>
                                            </TextField>
                                        </Field>
                                        <Flex align="center" gap="xs">
                                            <Field name="runUntagged">
                                                <Switch>
                                                    {t(
                                                        "form.gitlab.runUntagged.label",
                                                    )}
                                                </Switch>
                                            </Field>
                                            <FieldHelp
                                                subject={t(
                                                    "form.gitlab.runUntagged.label",
                                                )}
                                                text={t(
                                                    "form.gitlab.runUntagged.help",
                                                )}
                                            />
                                        </Flex>
                                    </>
                                )}
                            </>
                        )}

                        {provider === "gitlab" &&
                            tokenType === "registration" && (
                                <ParsedCommand
                                    provider="gitlab"
                                    command={configCommand}
                                />
                            )}
                    </Section>

                    <Section>
                        <Heading>{t("form.section.runner")}</Heading>
                        <Field
                            name="name"
                            rules={{ required: t("form.name.required") }}
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
                        {(provider !== "gitlab" || tokenType === "pat") && (
                            <Field name="labels">
                                <TextField>
                                    <Label>
                                        {provider === "gitlab"
                                            ? t("form.tags.label")
                                            : t("form.labels.label")}
                                        <FieldHelp
                                            subject={t("form.labels.label")}
                                            text={
                                                provider === "gitlab"
                                                    ? t("form.tags.help")
                                                    : t("form.labels.help")
                                            }
                                        />
                                    </Label>
                                    <FieldDescription>
                                        {t("form.labels.description")}
                                    </FieldDescription>
                                </TextField>
                            </Field>
                        )}
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
                    />
                </AccentBox>
            </ColumnLayout>

            <ActionGroup>
                <SubmitButton color="primary">
                    {t("form.create.button")}
                </SubmitButton>
                <Button color="secondary" variant="soft" onPress={modal.close}>
                    {t("form.cancel")}
                </Button>
            </ActionGroup>
        </Form>
    );
};
