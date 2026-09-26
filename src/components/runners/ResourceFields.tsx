import {
    ColumnLayout,
    Content,
    FieldDescription,
    Label,
    NumberField,
    RadioButton,
    RadioGroup,
    Text,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import type { RunnerSize } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import {
    CPU_RANGE,
    MEMORY_GB_RANGE,
    runnerSizes,
    toMemoryGb,
} from "@/runner-sizes.ts";
import { FieldHelp } from "./FieldHelp.tsx";

const presets = ["small", "medium", "large"] as const;

export interface ResourceFormValues {
    size: RunnerSize;
    cpus: number;
    memoryGb: number;
}

/**
 * Shared by the create form and the settings modal. The presets keep their
 * limits in the domain and show them on their card, custom exposes CPU and
 * memory as two fields.
 */
export function ResourceFields<T extends ResourceFormValues>({
    form,
    description,
}: {
    form: UseFormReturn<T>;
    description: string;
}) {
    const t = useTranslation();
    const Field = typedField(form);
    const size = form.watch("size" as Path<T>) as RunnerSize;

    return (
        <>
            <Field name={"size" as Path<T>} rules={{ required: true }}>
                <RadioGroup s={[1, 1]} m={[1, 1, 1, 1]}>
                    <Label>
                        {t("form.size.label")}
                        <FieldHelp
                            subject={t("form.size.label")}
                            text={t("form.size.help")}
                        />
                    </Label>
                    {presets.map((preset) => (
                        <RadioButton key={preset} value={preset}>
                            <Text>{t(`form.size.${preset}`)}</Text>
                            <Content>
                                {t("form.size.limits", {
                                    cpus: runnerSizes[preset].cpus,
                                    memory: toMemoryGb(
                                        runnerSizes[preset].memoryMb,
                                    ),
                                })}
                            </Content>
                        </RadioButton>
                    ))}
                    <RadioButton value="custom">
                        <Text>{t("form.size.custom")}</Text>
                        <Content>{t("form.size.custom.text")}</Content>
                    </RadioButton>
                    <FieldDescription>{description}</FieldDescription>
                </RadioGroup>
            </Field>
            {size === "custom" && (
                <ColumnLayout s={[1]} m={[1, 1]}>
                    <Field
                        name={"cpus" as Path<T>}
                        rules={{
                            required: t("form.cpus.required"),
                            min: {
                                value: CPU_RANGE.min,
                                message: t("form.cpus.range"),
                            },
                            max: {
                                value: CPU_RANGE.max,
                                message: t("form.cpus.range"),
                            },
                        }}
                    >
                        <NumberField
                            minValue={CPU_RANGE.min}
                            maxValue={CPU_RANGE.max}
                            step={CPU_RANGE.step}
                        >
                            <Label>
                                {t("form.cpus.label")}
                                <FieldHelp
                                    subject={t("form.cpus.label")}
                                    text={t("form.cpus.help")}
                                />
                            </Label>
                            <FieldDescription>
                                {t("form.cpus.description")}
                            </FieldDescription>
                        </NumberField>
                    </Field>
                    <Field
                        name={"memoryGb" as Path<T>}
                        rules={{
                            required: t("form.memory.required"),
                            min: {
                                value: MEMORY_GB_RANGE.min,
                                message: t("form.memory.range"),
                            },
                            max: {
                                value: MEMORY_GB_RANGE.max,
                                message: t("form.memory.range"),
                            },
                        }}
                    >
                        <NumberField
                            minValue={MEMORY_GB_RANGE.min}
                            maxValue={MEMORY_GB_RANGE.max}
                            step={MEMORY_GB_RANGE.step}
                        >
                            <Label>
                                {t("form.memory.label")}
                                <FieldHelp
                                    subject={t("form.memory.label")}
                                    text={t("form.memory.help")}
                                />
                            </Label>
                            <FieldDescription>
                                {t("form.memory.description")}
                            </FieldDescription>
                        </NumberField>
                    </Field>
                </ColumnLayout>
            )}
        </>
    );
}
