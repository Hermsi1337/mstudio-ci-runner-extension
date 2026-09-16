import { Flex, Switch } from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

export interface ImageBuildsFormValues {
    imageBuilds: boolean;
}

/**
 * Shared by the create form and the settings modal, like CacheFields. The
 * generic keeps the field typed against the owning form, whose values are a
 * superset.
 */
export function ImageBuildsField<T extends ImageBuildsFormValues>({
    form,
}: {
    form: UseFormReturn<T>;
}) {
    const t = useTranslation();
    const Field = typedField(form);

    return (
        <Flex align="center" gap="xs">
            <Field name={"imageBuilds" as Path<T>}>
                <Switch>{t("form.imageBuilds.label")}</Switch>
            </Field>
            <FieldHelp
                subject={t("form.imageBuilds.label")}
                text={t("form.imageBuilds.help")}
            />
        </Flex>
    );
}
