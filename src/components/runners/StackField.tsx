import {
    FieldDescription,
    Label,
    Option,
    Select,
} from "@mittwald/flow-remote-react-components";
import { typedField } from "@mittwald/flow-remote-react-components/react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { Path, UseFormReturn } from "react-hook-form";
import type { ProjectStack } from "@/generated/extension-api";
import { ProjectClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";
import { FieldHelp } from "./FieldHelp.tsx";

export const AUTOMATIC_STACK = "auto";

const STACK_LIST_STALE_TIME_MS = 30_000;

export interface StackFormValues {
    stackId: string;
}

/**
 * A stack the user picks is what gives a job access to the other services of
 * that stack, for example a database for migrations. The list is loaded
 * without suspense and without retry: a project whose stacks cannot be read
 * still offers the automatic option, which is what every runner used before.
 */
export function useProjectStacks(): ProjectStack[] {
    const { data } = useQuery({
        queryKey: ["projectStacks"],
        queryFn: async () => await ProjectClientGhost.listProjectStacks({}),
        retry: false,
        staleTime: STACK_LIST_STALE_TIME_MS,
    });

    return data ?? [];
}

export function StackField<T extends StackFormValues>({
    form,
    stacks,
}: {
    form: UseFormReturn<T>;
    stacks: ProjectStack[];
}) {
    const t = useTranslation();
    const Field = typedField(form);

    return (
        <Field name={"stackId" as Path<T>} rules={{ required: true }}>
            <Select>
                <Label>
                    {t("form.stack.label")}
                    <FieldHelp
                        subject={t("form.stack.label")}
                        text={t("form.stack.help")}
                    />
                </Label>
                <Option value={AUTOMATIC_STACK}>
                    {t("form.stack.automatic")}
                </Option>
                {stacks.map((stack) => (
                    <Option key={stack.id} value={stack.id}>
                        {t("form.stack.option", {
                            name: stack.description,
                            services: stack.serviceCount,
                        })}
                    </Option>
                ))}
                <FieldDescription>
                    {t("form.stack.description")}
                </FieldDescription>
            </Select>
        </Field>
    );
}
