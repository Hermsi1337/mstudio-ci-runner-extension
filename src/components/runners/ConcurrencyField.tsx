import {
    FieldDescription,
    Label,
    NumberField,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import type { RunnerSize } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

export interface ConcurrencyFormValues {
    concurrency: number;
}

/**
 * Shared by the create form and the settings modal, GitLab only. The
 * recommendation follows the runner size.
 */
export function ConcurrencyField<T extends ConcurrencyFormValues>({
    form,
    size,
}: {
    form: UseFormReturn<T>;
    size: RunnerSize;
}) {
    const t = useTranslation();
    const Field = typedField(form);

    return (
        <Field
            name={"concurrency" as Path<T>}
            rules={{
                required: t("form.concurrency.required"),
                min: { value: 1, message: t("form.concurrency.range") },
                max: { value: 8, message: t("form.concurrency.range") },
            }}
        >
            <NumberField minValue={1} maxValue={8} step={1}>
                <Label>
                    {t("form.concurrency.label")}
                    <FieldHelp
                        subject={t("form.concurrency.label")}
                        text={t("form.concurrency.help")}
                    />
                </Label>
                <FieldDescription>
                    {t(`form.concurrency.recommendation.${size}`)}
                </FieldDescription>
            </NumberField>
        </Field>
    );
}
