import {
    Alert,
    Checkbox,
    ColumnLayout,
    Content,
    FieldDescription,
    Flex,
    Heading,
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
    GIGABYTE_FORMAT,
    MEMORY_GB_RANGE,
    runnerSizes,
    toMemoryGb,
} from "@/runner-sizes.ts";
import { FieldHelp } from "./FieldHelp.tsx";
import type { ResourceFormValues } from "./resource-request.ts";

const presets = ["small", "medium", "large"] as const;

const limitFields = {
    cpus: {
        value: "cpus",
        noLimit: "noCpuLimit",
        range: CPU_RANGE,
        formatOptions: undefined,
    },
    memory: {
        value: "memoryGb",
        noLimit: "noMemoryLimit",
        range: MEMORY_GB_RANGE,
        formatOptions: GIGABYTE_FORMAT,
    },
} as const;

/**
 * One limit of the custom size: its field, hidden while "No limit" is
 * checked, and the checkbox below it.
 */
function LimitField<T extends ResourceFormValues>({
    form,
    limit,
}: {
    form: UseFormReturn<T>;
    limit: keyof typeof limitFields;
}) {
    const t = useTranslation();
    const Field = typedField(form);
    const field = limitFields[limit];
    const noLimit = form.watch(field.noLimit as Path<T>) as boolean;

    return (
        <Flex direction="column" gap="s">
            {!noLimit && (
                <Field
                    name={field.value as Path<T>}
                    rules={{
                        required: t(`form.${limit}.required`),
                        min: {
                            value: field.range.min,
                            message: t(`form.${limit}.range`),
                        },
                        max: {
                            value: field.range.max,
                            message: t(`form.${limit}.range`),
                        },
                    }}
                >
                    <NumberField
                        minValue={field.range.min}
                        maxValue={field.range.max}
                        step={field.range.step}
                        formatOptions={field.formatOptions}
                    >
                        <Label>
                            {t(`form.${limit}.label`)}
                            <FieldHelp
                                subject={t(`form.${limit}.label`)}
                                text={t(`form.${limit}.help`)}
                            />
                        </Label>
                        <FieldDescription>
                            {t(`form.${limit}.description`)}
                        </FieldDescription>
                    </NumberField>
                </Field>
            )}
            <Field name={field.noLimit as Path<T>}>
                <Checkbox>{t(`form.${limit}.noLimit`)}</Checkbox>
            </Field>
        </Flex>
    );
}

/**
 * Shared by the create form and the settings modal. The presets keep their
 * limits in the domain and show them on their card, custom exposes CPU and
 * memory as two fields, each of which can be left without a limit.
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
    const noMemoryLimit = form.watch("noMemoryLimit" as Path<T>) as boolean;

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
                <>
                    <ColumnLayout s={[1]} m={[1, 1]}>
                        <LimitField form={form} limit="cpus" />
                        <LimitField form={form} limit="memory" />
                    </ColumnLayout>
                    {noMemoryLimit && (
                        <Alert status="warning">
                            <Heading>
                                {t("form.memory.noLimit.warning.heading")}
                            </Heading>
                            <Text>{t("form.memory.noLimit.warning.text")}</Text>
                        </Alert>
                    )}
                </>
            )}
        </>
    );
}
