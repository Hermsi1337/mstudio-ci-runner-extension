import {
    ActionGroup,
    Button,
    FieldDescription,
    Flex,
    Label,
    Option,
    Section,
    Select,
    Switch,
    TextField,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import {
    Form,
    typedField,
} from "@mittwald/flow-remote-react-components/react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type {
    CreateRunnerRequest,
    GitLabRunnerType,
    Provider,
    RunnerSize,
} from "@/generated/extension-api";

type GitHubTokenType = NonNullable<
    Extract<CreateRunnerRequest, { provider: "github" }>["tokenType"]
>;

const GITHUB_HOST = "https://github.com/";

function runnerSetupUrl(target: string): string {
    const path = target
        .trim()
        .replace(GITHUB_HOST, "")
        .replace(/^\/+|\/+$/g, "");
    if (!path) {
        return GITHUB_HOST;
    }
    return path.includes("/")
        ? `${GITHUB_HOST}${path}/settings/actions/runners/new`
        : `${GITHUB_HOST}organizations/${path}/settings/actions/runners/new`;
}

import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

interface FormValues {
    provider: Provider;
    name: string;
    labels: string;
    size: RunnerSize;
    ephemeral: boolean;
    cache: boolean;
    tokenType: GitHubTokenType;
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
        cache: values.cache,
    };
    if (values.provider === "gitlab") {
        return {
            ...base,
            provider: "gitlab",
            instanceUrl: values.instanceUrl,
            runnerType: values.runnerType,
            target: values.target || undefined,
            token: values.token,
            runUntagged: values.runUntagged,
            ephemeral: false,
        };
    }
    return {
        ...base,
        provider: "github",
        target: values.target,
        tokenType: values.tokenType,
        token: values.token,
        runnerGroup: values.runnerGroup || undefined,
        ephemeral: values.tokenType === "pat" && values.ephemeral,
    };
}

export const RunnerForm = () => {
    const t = useTranslation();
    const queryClient = useQueryClient();
    const modal = useOverlayController("Modal");

    const form = useForm<FormValues>({
        defaultValues: {
            provider: "github",
            name: "",
            labels: "mittwald",
            size: "medium",
            ephemeral: false,
            cache: false,
            tokenType: "registration",
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
    const target = form.watch("target");
    const runnerType = form.watch("runnerType");
    const instanceUrl = form.watch("instanceUrl").replace(/\/+$/, "");

    const [RootError, handleSubmit] = useFormErrorHandling(
        form,
        async (values) => {
            await RunnerClientGhost.createRunner({ data: toRequest(values) });
            RunnerClientGhost.listRunners().invalidate(queryClient);
            modal.close();
        },
    );

    return (
        <Form form={form} onSubmit={handleSubmit}>
            <Section>
                <Field name="provider" rules={{ required: true }}>
                    <Select>
                        <Label>
                            {t("form.provider.label")}
                            <FieldHelp
                                subject={t("form.provider.label")}
                                text={t("form.provider.help")}
                            />
                        </Label>
                        <Option value="github">{t("provider.github")}</Option>
                        <Option value="gitlab">{t("provider.gitlab")}</Option>
                    </Select>
                </Field>

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

                {provider === "github" && (
                    <>
                        <Field
                            name="target"
                            rules={{
                                required: t("form.github.target.required"),
                            }}
                        >
                            <TextField
                                placeholder={t(
                                    "form.github.target.placeholder",
                                )}
                            >
                                <Label>
                                    {t("form.github.target.label")}
                                    <FieldHelp
                                        subject={t("form.github.target.label")}
                                        text={t("form.github.target.help")}
                                    />
                                </Label>
                                <FieldDescription>
                                    {t("form.github.target.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="tokenType" rules={{ required: true }}>
                            <Select>
                                <Label>
                                    {t("form.github.tokenType.label")}
                                    <FieldHelp
                                        subject={t(
                                            "form.github.tokenType.label",
                                        )}
                                        text={t("form.github.tokenType.help")}
                                    />
                                </Label>
                                <Option value="registration">
                                    {t("form.github.tokenType.registration")}
                                </Option>
                                <Option value="pat">
                                    {t("form.github.tokenType.pat")}
                                </Option>
                            </Select>
                        </Field>
                        {tokenType === "pat" ? (
                            <Field
                                name="token"
                                rules={{
                                    required: t("form.github.token.required"),
                                }}
                            >
                                <TextField type="password">
                                    <Label>
                                        {t("form.github.token.label")}
                                        <FieldHelp
                                            subject={t(
                                                "form.github.token.label",
                                            )}
                                            text={t("form.github.token.help")}
                                            link={{
                                                href: "https://github.com/settings/personal-access-tokens/new",
                                                label: t(
                                                    "form.github.token.link",
                                                ),
                                            }}
                                        />
                                    </Label>
                                    <FieldDescription>
                                        {t("form.github.token.description")}
                                    </FieldDescription>
                                </TextField>
                            </Field>
                        ) : (
                            <Field
                                name="token"
                                rules={{
                                    required: t(
                                        "form.github.registrationToken.required",
                                    ),
                                }}
                            >
                                <TextField type="password">
                                    <Label>
                                        {t(
                                            "form.github.registrationToken.label",
                                        )}
                                        <FieldHelp
                                            subject={t(
                                                "form.github.registrationToken.label",
                                            )}
                                            text={t(
                                                "form.github.registrationToken.help",
                                            )}
                                            link={{
                                                href: runnerSetupUrl(target),
                                                label: t(
                                                    "form.github.registrationToken.link",
                                                ),
                                            }}
                                        />
                                    </Label>
                                    <FieldDescription>
                                        {t(
                                            "form.github.registrationToken.description",
                                        )}
                                    </FieldDescription>
                                </TextField>
                            </Field>
                        )}
                        <Field name="runnerGroup">
                            <TextField>
                                <Label>
                                    {t("form.github.runnerGroup.label")}
                                    <FieldHelp
                                        subject={t(
                                            "form.github.runnerGroup.label",
                                        )}
                                        text={t("form.github.runnerGroup.help")}
                                    />
                                </Label>
                            </TextField>
                        </Field>
                        {tokenType === "pat" && (
                            <Flex align="center" gap="xs">
                                <Field name="ephemeral">
                                    <Switch>
                                        {t("form.github.ephemeral.label")}
                                    </Switch>
                                </Field>
                                <FieldHelp
                                    subject={t("form.github.ephemeral.label")}
                                    text={t("form.github.ephemeral.help")}
                                />
                            </Flex>
                        )}
                    </>
                )}

                {provider === "gitlab" && (
                    <>
                        <Field
                            name="instanceUrl"
                            rules={{
                                required: t("form.gitlab.instanceUrl.required"),
                            }}
                        >
                            <TextField>
                                <Label>
                                    {t("form.gitlab.instanceUrl.label")}
                                    <FieldHelp
                                        subject={t(
                                            "form.gitlab.instanceUrl.label",
                                        )}
                                        text={t("form.gitlab.instanceUrl.help")}
                                    />
                                </Label>
                                <FieldDescription>
                                    {t("form.gitlab.instanceUrl.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runnerType">
                            <Select>
                                <Label>
                                    {t("form.gitlab.runnerType.label")}
                                    <FieldHelp
                                        subject={t(
                                            "form.gitlab.runnerType.label",
                                        )}
                                        text={t("form.gitlab.runnerType.help")}
                                    />
                                </Label>
                                <Option value="project_type">
                                    {t("form.gitlab.runnerType.project")}
                                </Option>
                                <Option value="group_type">
                                    {t("form.gitlab.runnerType.group")}
                                </Option>
                                <Option value="instance_type">
                                    {t("form.gitlab.runnerType.instance")}
                                </Option>
                            </Select>
                        </Field>
                        {runnerType !== "instance_type" && (
                            <Field
                                name="target"
                                rules={{
                                    required: t("form.gitlab.path.required"),
                                }}
                            >
                                <TextField
                                    placeholder={t(
                                        "form.gitlab.path.placeholder",
                                    )}
                                >
                                    <Label>
                                        {runnerType === "group_type"
                                            ? t("form.gitlab.groupPath.label")
                                            : t(
                                                  "form.gitlab.projectPath.label",
                                              )}
                                        <FieldHelp
                                            subject={t(
                                                "form.gitlab.projectPath.label",
                                            )}
                                            text={t("form.gitlab.path.help")}
                                        />
                                    </Label>
                                </TextField>
                            </Field>
                        )}
                        <Field
                            name="token"
                            rules={{
                                required: t("form.gitlab.token.required"),
                            }}
                        >
                            <TextField type="password">
                                <Label>
                                    {t("form.gitlab.token.label")}
                                    <FieldHelp
                                        subject={t("form.gitlab.token.label")}
                                        text={t("form.gitlab.token.help")}
                                        link={{
                                            href: `${instanceUrl}/-/user_settings/personal_access_tokens`,
                                            label: t("form.gitlab.token.link"),
                                        }}
                                    />
                                </Label>
                                <FieldDescription>
                                    {t("form.gitlab.token.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Flex align="center" gap="xs">
                            <Field name="runUntagged">
                                <Switch>
                                    {t("form.gitlab.runUntagged.label")}
                                </Switch>
                            </Field>
                            <FieldHelp
                                subject={t("form.gitlab.runUntagged.label")}
                                text={t("form.gitlab.runUntagged.help")}
                            />
                        </Flex>
                    </>
                )}

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

                <Field name="size" rules={{ required: true }}>
                    <Select>
                        <Label>
                            {t("form.size.label")}
                            <FieldHelp
                                subject={t("form.size.label")}
                                text={t("form.size.help")}
                            />
                        </Label>
                        <Option value="small">{t("form.size.small")}</Option>
                        <Option value="medium">{t("form.size.medium")}</Option>
                        <Option value="large">{t("form.size.large")}</Option>
                    </Select>
                </Field>

                <Flex align="center" gap="xs">
                    <Field name="cache">
                        <Switch>{t("form.cache.label")}</Switch>
                    </Field>
                    <FieldHelp
                        subject={t("form.cache.label")}
                        text={t("form.cache.help")}
                    />
                </Flex>

                <RootError />

                <ActionGroup>
                    <Button
                        color="secondary"
                        variant="soft"
                        onPress={modal.close}
                    >
                        {t("form.cancel")}
                    </Button>
                    <Button type="submit" color="primary">
                        {t("form.create.button")}
                    </Button>
                </ActionGroup>
            </Section>
        </Form>
    );
};
