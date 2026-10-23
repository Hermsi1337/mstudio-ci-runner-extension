import {
    FieldDescription,
    Label,
    TextField,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

/**
 * Mirror zRunnerBase.name and zConfigureRunnerRequest.name from
 * src/generated/extension-api/zod.gen.ts. The server rejects the same values,
 * but only in English and only after the request, so the form checks them
 * first. Keep both in sync when the spec changes.
 */
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 64;

export interface NameFormValues {
    name: string;
}

/**
 * Shared by the create form and the settings modal; each passes the texts
 * that say what the name changes there.
 */
export function NameField<T extends NameFormValues>({
    form,
    description,
    help,
}: {
    form: UseFormReturn<T>;
    description: string;
    help: string;
}) {
    const t = useTranslation();
    const Field = typedField(form);

    return (
        <Field
            name={"name" as Path<T>}
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
                    <FieldHelp subject={t("form.name.label")} text={help} />
                </Label>
                <FieldDescription>{description}</FieldDescription>
            </TextField>
        </Field>
    );
}
