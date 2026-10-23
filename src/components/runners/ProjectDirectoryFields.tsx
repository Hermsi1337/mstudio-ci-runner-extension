import {
    Button,
    Checkbox,
    ColumnLayout,
    FieldDescription,
    Flex,
    Heading,
    IconDelete,
    IconPlus,
    Label,
    Link,
    Section,
    Text,
    TextField,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import { useEffect, useRef } from "react";
import { type UseFormReturn, useFieldArray, useWatch } from "react-hook-form";
import type { ProjectDirectory } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import {
    MAX_PROJECT_DIRECTORIES,
    type ProjectDirectoryField,
    projectDirectoryIssues,
    suggestTarget,
} from "@/project-directories.ts";
import { DOCS_URL } from "@/repository.ts";
import { FieldHelp } from "./FieldHelp.tsx";

export interface ProjectDirectoryFormValues {
    projectDirectories: ProjectDirectory[];
}

type DirectoryForm = UseFormReturn<ProjectDirectoryFormValues>;

const SYNC_DOCS_URL = `${DOCS_URL}/runner-image.md#project-directories`;

/**
 * One entry. The target follows the source (`/deploy/<last segment>`) as long
 * as it is empty or still holds the suggestion for the previous source, so a
 * path the user typed stays.
 */
function DirectoryRow({
    form,
    index,
    onRemove,
}: {
    form: DirectoryForm;
    index: number;
    onRemove: () => void;
}) {
    const t = useTranslation();
    const Field = typedField(form);
    const source = form.watch(`projectDirectories.${index}.source`);
    const previousSource = useRef(source);

    useEffect(() => {
        const name = `projectDirectories.${index}.target` as const;
        const target = form.getValues(name);
        const suggestion = suggestTarget(source);
        if (
            target !== suggestion &&
            (target === "" || target === suggestTarget(previousSource.current))
        ) {
            form.setValue(name, suggestion);
        }
        previousSource.current = source;
    }, [form, index, source]);

    const validate = (field: ProjectDirectoryField) => () => {
        const issue = projectDirectoryIssues(
            form.getValues("projectDirectories"),
        ).find((found) => found.index === index && found.field === field);

        return issue ? t(issue.messageKey, issue.params) : true;
    };

    return (
        <Flex direction="column" gap="s">
            <ColumnLayout s={[1]} m={[1, 1]}>
                <Field
                    name={`projectDirectories.${index}.source`}
                    rules={{ validate: validate("source") }}
                >
                    <TextField placeholder="html/my-app">
                        <Label>{t("form.directories.source.label")}</Label>
                    </TextField>
                </Field>
                <Field
                    name={`projectDirectories.${index}.target`}
                    rules={{ validate: validate("target") }}
                >
                    <TextField placeholder="/deploy/my-app">
                        <Label>{t("form.directories.target.label")}</Label>
                    </TextField>
                </Field>
            </ColumnLayout>
            <Flex align="center" justify="space-between" gap="m">
                <Field name={`projectDirectories.${index}.readOnly`}>
                    <Checkbox>{t("form.directories.readOnly")}</Checkbox>
                </Field>
                <Button
                    variant="plain"
                    color="secondary"
                    aria-label={t("form.directories.remove", {
                        number: index + 1,
                    })}
                    onPress={onRemove}
                >
                    <IconDelete />
                </Button>
            </Flex>
        </Flex>
    );
}

/**
 * Shared by the create form and the settings modal, one row per entry of the
 * react-hook-form field array. The rows check the rules of the domain
 * (src/project-directories.ts), so a broken path shows at its row before the
 * request. The generic keeps the component usable by both forms, whose
 * values are a superset.
 */
export function ProjectDirectoryFields<T extends ProjectDirectoryFormValues>({
    form,
}: {
    form: UseFormReturn<T>;
}) {
    const t = useTranslation();
    const directoryForm = form as unknown as DirectoryForm;
    const { fields, append, remove } = useFieldArray({
        control: directoryForm.control,
        name: "projectDirectories",
    });
    const directories = useWatch({
        control: directoryForm.control,
        name: "projectDirectories",
    });
    const serialized = JSON.stringify(directories);
    const checked = useRef(serialized);

    // Duplicate and nested targets involve two rows, so a change in one row
    // checks again every field the user has left or that shows an error. Only
    // after a change of a value: on mount or after a submit, a server error the
    // form cannot reproduce (the work directory of Docker in jobs) has to stay.
    useEffect(() => {
        if (serialized === checked.current) {
            return;
        }
        checked.current = serialized;
        const names = directories.flatMap((_, index) =>
            (["source", "target"] as const)
                .map((field) => `projectDirectories.${index}.${field}` as const)
                .filter((name) => {
                    const state = directoryForm.getFieldState(name);
                    return state.isTouched || state.invalid;
                }),
        );
        if (names.length > 0) {
            void directoryForm.trigger(names);
        }
    }, [directoryForm, directories, serialized]);

    return (
        <Section>
            <Heading level={4}>
                {t("form.directories.label")}
                <FieldHelp
                    subject={t("form.directories.label")}
                    text={t("form.directories.help")}
                    link={{
                        href: SYNC_DOCS_URL,
                        label: t("form.directories.docs"),
                    }}
                />
            </Heading>
            <FieldDescription>
                {t("form.directories.description")}{" "}
                <Link href={SYNC_DOCS_URL} target="_blank">
                    {t("form.directories.docs")}
                </Link>
            </FieldDescription>
            {fields.map((field, index) => (
                <DirectoryRow
                    key={field.id}
                    form={directoryForm}
                    index={index}
                    onRemove={() => remove(index)}
                />
            ))}
            {fields.length < MAX_PROJECT_DIRECTORIES && (
                <Button
                    variant="soft"
                    color="secondary"
                    onPress={() =>
                        append({ source: "", target: "", readOnly: false })
                    }
                >
                    <IconPlus />
                    <Text>{t("form.directories.add")}</Text>
                </Button>
            )}
        </Section>
    );
}
