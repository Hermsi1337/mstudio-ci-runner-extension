import {
    CheckboxButton,
    CheckboxGroup,
    Content,
    FieldDescription,
    Label,
    NumberField,
    Text,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, PathValue, UseFormReturn } from "react-hook-form";
import { useTranslation } from "@/i18n/react.tsx";
import { DOCS_URL } from "@/repository.ts";
import { FieldHelp } from "./FieldHelp.tsx";

export interface JobFeatureFormValues {
    cache: boolean;
    cacheSizeGb: number;
    imageBuilds: boolean;
    dockerApi: boolean;
}

const features = ["cache", "imageBuilds", "dockerApi"] as const;

/**
 * Shared by the create form and the settings modal. The group holds the three
 * booleans of the API as one list of keys, so the form values keep the shape
 * of the request. The generic keeps the fields typed against the owning form,
 * whose values are a superset. Flow's column layout does not stretch the cards
 * to one height, and a CheckboxButton wider than its text centers the text,
 * so the cards sit side by side and their descriptions keep about the same
 * length.
 */
export function JobFeatureFields<T extends JobFeatureFormValues>({
    form,
}: {
    form: UseFormReturn<T>;
}) {
    const t = useTranslation();
    const Field = typedField(form);
    const selected = features.filter((feature) =>
        form.watch(feature as Path<T>),
    );

    const select = (keys: string[]) => {
        for (const feature of features) {
            form.setValue(
                feature as Path<T>,
                keys.includes(feature) as PathValue<T, Path<T>>,
                { shouldDirty: true },
            );
        }
    };

    return (
        <>
            <CheckboxGroup
                value={selected}
                onChange={select}
                s={[1]}
                m={[1, 1, 1]}
            >
                <Label>
                    {t("form.section.features")}
                    <FieldHelp
                        subject={t("form.section.features")}
                        text={t("form.features.help")}
                        link={{
                            href: DOCS_URL,
                            label: t("form.features.docs"),
                        }}
                    />
                </Label>
                {features.map((feature) => (
                    <CheckboxButton key={feature} value={feature}>
                        <Text>{t(`form.${feature}.label`)}</Text>
                        <Content>{t(`form.${feature}.description`)}</Content>
                    </CheckboxButton>
                ))}
            </CheckboxGroup>
            {selected.includes("cache") && (
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
