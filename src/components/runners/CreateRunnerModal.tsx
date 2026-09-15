import {
    Button,
    ColumnLayout,
    Content,
    Flex,
    Heading,
    Image,
    Modal,
    type OverlayController,
    Text,
} from "@mittwald/flow-remote-react-components";
import { useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import type { Provider } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import { providerLogos } from "./provider-logos.ts";
import { RunnerForm } from "./RunnerForm.tsx";

const providers: Provider[] = ["github", "gitlab"];

const ProviderChoice = ({
    onSelect,
}: {
    onSelect: (provider: Provider) => void;
}) => {
    const t = useTranslation();
    return (
        <ColumnLayout s={[6, 6]}>
            {providers.map((provider) => (
                <Button
                    key={provider}
                    color="secondary"
                    variant="outline"
                    onPress={() => onSelect(provider)}
                >
                    <Flex direction="column" align="center" gap="xs">
                        <Image
                            src={providerLogos[provider]}
                            alt=""
                            width={48}
                            height={48}
                        />
                        <Heading level={4}>{t(`provider.${provider}`)}</Heading>
                        <Text>{t(`form.provider.${provider}.text`)}</Text>
                    </Flex>
                </Button>
            ))}
        </ColumnLayout>
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
