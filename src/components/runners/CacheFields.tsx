import {
    FieldDescription,
    Flex,
    Label,
    NumberField,
    Switch,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

export interface CacheFormValues {
    cache: boolean;
    cacheSizeGb: number;
}

/**
 * Shared by the create form and the settings modal. The generic keeps the
 * fields typed against the owning form, whose values are a superset.
 */
export function CacheFields<T extends CacheFormValues>({
    form,
}: {
    form: UseFormReturn<T>;
}) {
    const t = useTranslation();
    const Field = typedField(form);
    const cache = form.watch("cache" as Path<T>);

    return (
        <>
            <Flex align="center" gap="xs">
                <Field name={"cache" as Path<T>}>
                    <Switch>{t("form.cache.label")}</Switch>
                </Field>
                <FieldHelp
                    subject={t("form.cache.label")}
                    text={t("form.cache.help")}
                />
            </Flex>
            {cache && (
                <Field
                    name={"cacheSizeGb" as Path<T>}
                    rules={{
                        required: t("form.cacheSize.required"),
                        min: {
                            value: 1,
                            message: t("form.cacheSize.range"),
                        },
                        max: {
                            value: 500,
                            message: t("form.cacheSize.range"),
                        },
                    }}
                >
                    <NumberField minValue={1} maxValue={500} step={1}>
                        <Label>
                            {t("form.cacheSize.label")}
                            <FieldHelp
                                subject={t("form.cacheSize.label")}
                                text={t("form.cacheSize.help")}
                            />
                        </Label>
                        <FieldDescription>
                            {t("form.cacheSize.description")}
                        </FieldDescription>
                    </NumberField>
                </Field>
            )}
        </>
    );
}
