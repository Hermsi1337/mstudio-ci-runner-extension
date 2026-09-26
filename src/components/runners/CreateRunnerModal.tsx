import {
    Avatar,
    Content,
    Heading,
    Image,
    Modal,
    type OverlayController,
    Text,
    typedList,
} from "@mittwald/flow-remote-react-components";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import type { Provider } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import { providerLogos } from "./provider-logos.ts";
import { RunnerForm } from "./RunnerForm.tsx";

interface ProviderEntry {
    id: Provider;
}

const providers: ProviderEntry[] = [
    { id: "github" },
    { id: "gitlab" },
    { id: "forgejo" },
];

const ProviderListTyped = typedList<ProviderEntry>();

const ProviderChoice = ({
    onSelect,
}: {
    onSelect: (provider: Provider) => void;
}) => {
    const t = useTranslation();
    return (
        <ProviderListTyped.List
            aria-label={t("form.provider.question")}
            getItemId={(entry) => entry.id}
            onAction={(entry) => onSelect(entry.id)}
            hidePagination
        >
            <ProviderListTyped.StaticData data={providers} />
            <ProviderListTyped.Item
                textValue={(entry) => t(`provider.${entry.id}`)}
            >
                {(entry) => (
                    <ProviderListTyped.ItemView>
                        <Avatar>
                            <Image src={providerLogos[entry.id]} alt="" />
                        </Avatar>
                        <Heading>{t(`provider.${entry.id}`)}</Heading>
                        <Text>{t(`form.provider.${entry.id}.text`)}</Text>
                    </ProviderListTyped.ItemView>
                )}
            </ProviderListTyped.Item>
        </ProviderListTyped.List>
    );
};

/**
 * Two phases: first the provider choice, then the form for that provider,
 * so nobody faces the full field set at once. Size l gives the form its two
 * columns: fields left, the resources the runner gets in the project right
 * (ColumnLayout plus AccentBox inside RunnerForm). Not dismissable by
 * clicking outside so a half-filled form does not vanish. Driven by a
 * controller because a ModalTrigger inside the card header would hand the
 * form's ActionGroup to the header's action slot.
 */
export const CreateRunnerModal = ({
    controller,
}: {
    controller: OverlayController;
}) => {
    const t = useTranslation();
    const [provider, setProvider] = useState<Provider | null>(null);
    controller.useUpdateOptions({ onClose: () => setProvider(null) });
    return (
        <Modal
            offCanvas
            size={provider ? "l" : "m"}
            isDismissable={provider === null}
            controller={controller}
        >
            <Heading>
                {provider
                    ? t("form.create.heading")
                    : t("form.provider.question")}
            </Heading>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                {provider === null ? (
                    <Content>
                        <ProviderChoice onSelect={setProvider} />
                    </Content>
                ) : (
                    <RunnerForm
                        initialProvider={provider}
                        onChangeProvider={() => setProvider(null)}
                    />
                )}
            </ErrorBoundary>
        </Modal>
    );
};
