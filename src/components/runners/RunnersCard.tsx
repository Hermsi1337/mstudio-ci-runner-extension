import {
    Accordion,
    Alert,
    Button,
    Content,
    Header,
    Heading,
    LayoutCard,
    Markdown,
    Section,
    SkeletonText,
    Text,
    useOverlayController,
} from "@mittwald/flow-remote-react-components";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { CreateRunnerModal } from "./CreateRunnerModal.tsx";
import { RunnerList } from "./RunnerList.tsx";

/**
 * The create modal lives next to the card, not inside its header: a Section
 * header collects every ActionGroup below it into its action slot, which
 * would swallow the form's submit and cancel buttons.
 */
export const RunnersCard = () => {
    const t = useTranslation();
    const { reset } = useQueryErrorResetBoundary();
    const createModal = useOverlayController("Modal", {
        reuseControllerFromContext: false,
    });
    return (
        <>
            <LayoutCard>
                <Section>
                    <Header>
                        <Heading>{t("runners.heading")}</Heading>
                        <Button color="primary" onPress={createModal.open}>
                            {t("form.create.button")}
                        </Button>
                    </Header>
                    <Alert status="info">
                        <Heading>{t("runners.intro.heading")}</Heading>
                        <Content>
                            <Text>{t("runners.intro")}</Text>
                        </Content>
                    </Alert>
                    <Accordion>
                        <Heading>{t("app.dockerNotice.title")}</Heading>
                        <Content>
                            <Markdown>{t("app.dockerNotice.text")}</Markdown>
                        </Content>
                    </Accordion>
                    <ErrorBoundary
                        onReset={reset}
                        FallbackComponent={ErrorFallback}
                    >
                        <Suspense fallback={<SkeletonText />}>
                            <RunnerList onCreate={createModal.open} />
                        </Suspense>
                    </ErrorBoundary>
                </Section>
            </LayoutCard>
            <CreateRunnerModal controller={createModal} />
        </>
    );
};
