import {
    Action,
    ActionGroup,
    Button,
    FieldDescription,
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
import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useTranslation } from "@/i18n/react.tsx";

interface FormValues {
    provider: Provider;
    name: string;
    labels: string;
    size: RunnerSize;
    ephemeral: boolean;
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
        token: values.token,
        runnerGroup: values.runnerGroup || undefined,
        ephemeral: values.ephemeral,
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
    const runnerType = form.watch("runnerType");

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
                <Field name="provider">
                    <Select>
                        <Label>{t("form.provider.label")}</Label>
                        <Option value="github">{t("provider.github")}</Option>
                        <Option value="gitlab">{t("provider.gitlab")}</Option>
                    </Select>
                </Field>

                <Field
                    name="name"
                    rules={{ required: t("form.name.required") }}
                >
                    <TextField>
                        <Label>{t("form.name.label")}</Label>
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
                                <Label>{t("form.github.target.label")}</Label>
                                <FieldDescription>
                                    {t("form.github.target.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field
                            name="token"
                            rules={{
                                required: t("form.github.token.required"),
                            }}
                        >
                            <TextField type="password">
                                <Label>{t("form.github.token.label")}</Label>
                                <FieldDescription>
                                    {t("form.github.token.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runnerGroup">
                            <TextField>
                                <Label>
                                    {t("form.github.runnerGroup.label")}
                                </Label>
                            </TextField>
                        </Field>
                        <Field name="ephemeral">
                            <Switch>{t("form.github.ephemeral.label")}</Switch>
                        </Field>
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
                                <Label>{t("form.gitlab.token.label")}</Label>
                                <FieldDescription>
                                    {t("form.gitlab.token.description")}
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runUntagged">
                            <Switch>
                                {t("form.gitlab.runUntagged.label")}
                            </Switch>
                        </Field>
                    </>
                )}

                <Field name="labels">
                    <TextField>
                        <Label>
                            {provider === "gitlab"
                                ? t("form.tags.label")
                                : t("form.labels.label")}
                        </Label>
                        <FieldDescription>
                            {t("form.labels.description")}
                        </FieldDescription>
                    </TextField>
                </Field>

                <Field name="size">
                    <Select>
                        <Label>{t("form.size.label")}</Label>
                        <Option value="small">{t("form.size.small")}</Option>
                        <Option value="medium">{t("form.size.medium")}</Option>
                        <Option value="large">{t("form.size.large")}</Option>
                    </Select>
                </Field>

                <RootError />

                <ActionGroup>
                    <Action closeOverlay="Modal">
                        <Button color="secondary" variant="soft">
                            {t("form.cancel")}
                        </Button>
                    </Action>
                    <Button type="submit" color="primary">
                        {t("form.create.button")}
                    </Button>
                </ActionGroup>
            </Section>
        </Form>
    );
};
