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
                        <Label>CI system</Label>
                        <Option value="github">GitHub Actions</Option>
                        <Option value="gitlab">GitLab CI</Option>
                    </Select>
                </Field>

                <Field name="name" rules={{ required: "Name is required" }}>
                    <TextField>
                        <Label>Name</Label>
                        <FieldDescription>
                            Used as the runner name in the CI system.
                        </FieldDescription>
                    </TextField>
                </Field>

                {provider === "github" && (
                    <>
                        <Field
                            name="target"
                            rules={{
                                required:
                                    "Organization or repository is required",
                            }}
                        >
                            <TextField placeholder="owner or owner/repo">
                                <Label>GitHub organization or repository</Label>
                                <FieldDescription>
                                    Organization (e.g. <strong>my-org</strong>)
                                    or repository (e.g.{" "}
                                    <strong>my-org/my-repo</strong>).
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field
                            name="token"
                            rules={{ required: "GitHub token is required" }}
                        >
                            <TextField type="password">
                                <Label>GitHub token (PAT)</Label>
                                <FieldDescription>
                                    Fine-grained PAT with "Administration: Read
                                    and write" (repository) or "Self-hosted
                                    runners: Read and write" (organization).
                                    Stored encrypted and passed to the container
                                    as an environment variable.
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runnerGroup">
                            <TextField>
                                <Label>Runner group (optional)</Label>
                            </TextField>
                        </Field>
                        <Field name="ephemeral">
                            <Switch>
                                Ephemeral (fresh registration per job)
                            </Switch>
                        </Field>
                    </>
                )}

                {provider === "gitlab" && (
                    <>
                        <Field
                            name="instanceUrl"
                            rules={{ required: "GitLab URL is required" }}
                        >
                            <TextField>
                                <Label>GitLab instance</Label>
                                <FieldDescription>
                                    https://gitlab.com or the URL of your own
                                    instance.
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runnerType">
                            <Select>
                                <Label>Runner type</Label>
                                <Option value="project_type">Project</Option>
                                <Option value="group_type">Group</Option>
                                <Option value="instance_type">
                                    Instance (admin)
                                </Option>
                            </Select>
                        </Field>
                        {runnerType !== "instance_type" && (
                            <Field
                                name="target"
                                rules={{ required: "Path is required" }}
                            >
                                <TextField placeholder="group/project">
                                    <Label>
                                        {runnerType === "group_type"
                                            ? "Group path"
                                            : "Project path"}
                                    </Label>
                                </TextField>
                            </Field>
                        )}
                        <Field
                            name="token"
                            rules={{ required: "GitLab token is required" }}
                        >
                            <TextField type="password">
                                <Label>GitLab token (PAT)</Label>
                                <FieldDescription>
                                    Personal access token with the scopes{" "}
                                    <strong>create_runner</strong> and{" "}
                                    <strong>api</strong>. Only used to create
                                    the runner; the container receives the
                                    runner token only.
                                </FieldDescription>
                            </TextField>
                        </Field>
                        <Field name="runUntagged">
                            <Switch>Also run jobs without tags</Switch>
                        </Field>
                    </>
                )}

                <Field name="labels">
                    <TextField>
                        <Label>
                            {provider === "gitlab" ? "Tags" : "Labels"}
                        </Label>
                        <FieldDescription>
                            Comma separated. GitHub:{" "}
                            <strong>runs-on: [self-hosted, mittwald]</strong>,
                            GitLab: <strong>tags: [mittwald]</strong>.
                        </FieldDescription>
                    </TextField>
                </Field>

                <Field name="size">
                    <Select>
                        <Label>Size</Label>
                        <Option value="small">Small (0.5 CPU, 1 GB RAM)</Option>
                        <Option value="medium">Medium (1 CPU, 2 GB RAM)</Option>
                        <Option value="large">Large (2 CPU, 4 GB RAM)</Option>
                    </Select>
                </Field>

                <RootError />

                <ActionGroup>
                    <Action closeOverlay="Modal">
                        <Button color="secondary" variant="soft">
                            Cancel
                        </Button>
                    </Action>
                    <Button type="submit" color="primary">
                        Create runner
                    </Button>
                </ActionGroup>
            </Section>
        </Form>
    );
};
