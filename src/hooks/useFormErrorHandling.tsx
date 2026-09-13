import { Alert, Text } from "@mittwald/flow-remote-react-components";
import { type FC, useEffect } from "react";
import type {
    FieldPath,
    FieldValues,
    SubmitHandler,
    UseFormReturn,
} from "react-hook-form";
import { parsePublicError } from "@/global-errors.ts";

export function useFormErrorHandling<TFormValues extends FieldValues>(
    form: UseFormReturn<TFormValues>,
    submitHandler: SubmitHandler<TFormValues>,
): [FC, SubmitHandler<TFormValues>] {
    useEffect(() => {
        const subscription = form.watch(() => {
            if (form.formState.errors.root) {
                form.clearErrors("root");
            }
        });
        return () => subscription.unsubscribe();
    }, [form]);

    const submitWithErrorHandling = async (
        values: TFormValues,
    ): Promise<void> => {
        try {
            await submitHandler(values);
        } catch (error) {
            const publicError = parsePublicError(error as Error);
            let affectedField: string = "root";
            let message = "Something went wrong";

            if (publicError) {
                affectedField =
                    publicError.details.affectedField ?? affectedField;
                message = publicError.message;
            }
            form.setError(affectedField as FieldPath<TFormValues>, {
                type: "manual",
                message,
            });
        }
    };

    const RootError: FC = () => (
        <>
            {form.formState.errors.root && (
                <Alert status="danger">
                    <Text>{form.formState.errors.root.message}</Text>
                </Alert>
            )}
        </>
    );

    return [RootError, submitWithErrorHandling];
}
