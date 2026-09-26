import { Flex, Switch } from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import type { Path, UseFormReturn } from "react-hook-form";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

export interface DockerApiFormValues {
    dockerApi: boolean;
}

/** Shared by the create form and the settings modal, like ImageBuildsField. */
export function DockerApiField<T extends DockerApiFormValues>({
    form,
}: {
    form: UseFormReturn<T>;
}) {
    const t = useTranslation();
    const Field = typedField(form);

    return (
        <Flex align="center" gap="xs">
            <Field name={"dockerApi" as Path<T>}>
                <Switch>{t("form.dockerApi.label")}</Switch>
            </Field>
            <FieldHelp
                subject={t("form.dockerApi.label")}
                text={t("form.dockerApi.help")}
            />
        </Flex>
    );
}
