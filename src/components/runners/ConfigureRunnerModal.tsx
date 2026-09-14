import {
    ActionGroup,
    Button,
    Content,
    Heading,
    Modal,
    ModalTrigger,
    Section,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { Form } from "@mittwald/flow-remote-react-components/react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { Runner } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { CacheFields, type CacheFormValues } from "./CacheFields.tsx";
import {
    ConcurrencyField,
    type ConcurrencyFormValues,
} from "./ConcurrencyField.tsx";

type FormValues = CacheFormValues & ConcurrencyFormValues;

const ConfigureRunnerForm = ({ runner }: { runner: Runner }) => {
    const t = useTranslation();
    const queryClient = useQueryClient();
    const modal = useOverlayController("Modal");
    const form = useForm<FormValues>({
        defaultValues: {
            cache: runner.cache,
            cacheSizeGb: runner.cacheSizeGb,
            concurrency: runner.concurrency,
        },
    });
    const [RootError, handleSubmit] = useFormErrorHandling(
        form,
        async (values) => {
            await RunnerClientGhost.configureRunner({
                data: { runnerId: runner.id, ...values },
            });
            RunnerClientGhost.listRunners().invalidate(queryClient);
            modal.close();
        },
    );

    return (
        <Form form={form} onSubmit={handleSubmit}>
            <Section>
                <Text>{t("form.configure.text")}</Text>
                {runner.provider === "gitlab" && (
                    <ConcurrencyField form={form} size={runner.size} />
                )}
                <CacheFields form={form} />
                <RootError />
                <ActionGroup>
                    <Button
                        color="secondary"
                        variant="soft"
                        onPress={modal.close}
                    >
                        {t("form.cancel")}
                    </Button>
                    <Button type="submit" color="primary">
                        {t("form.configure.button")}
                    </Button>
                </ActionGroup>
            </Section>
        </Form>
    );
};

/**
 * Same layout as CreateRunnerModal: the heading sits inside Content so Flow
 * adds no close icon and the modal closes through the form buttons only.
 */
export const ConfigureRunnerModal = ({ runner }: { runner: Runner }) => {
    const t = useTranslation();
    return (
        <ModalTrigger>
            <Button color="secondary" variant="soft" size="s">
                {t("runners.action.configure")}
            </Button>
            <Modal size="m">
                <Content>
                    <Heading level={2}>
                        {t("form.configure.heading", { name: runner.name })}
                    </Heading>
                    <ConfigureRunnerForm runner={runner} />
                </Content>
            </Modal>
        </ModalTrigger>
    );
};
