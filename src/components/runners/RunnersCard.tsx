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
import { ProjectClientGhost } from "@/ghosts.ts";
import { useTranslation } from "@/i18n/react.tsx";
import { CreateRunnerModal } from "./CreateRunnerModal.tsx";
import { RunnerList } from "./RunnerList.tsx";

/**
 * Runners are containers. A project without Container Hosting cannot host
 * them, so the card offers nothing to create there and says why instead.
 */
const Runners = ({ onCreate }: { onCreate: () => void }) => {
    const t = useTranslation();
    const { value: capabilities } = ProjectClientGhost.getProjectCapabilities(
        {},
    ).useGhost();

    if (!capabilities.containerHosting) {
        return (
            <>
                <Header>
                    <Heading>{t("runners.heading")}</Heading>
                </Header>
                <Alert status="warning">
                    <Heading>
                        {t("runners.containerHosting.missing.heading")}
                    </Heading>
                    <Content>
                        <Text>{t("runners.containerHosting.missing")}</Text>
                    </Content>
                </Alert>
            </>
        );
    }

    return (
        <>
            <Header>
                <Heading>{t("runners.heading")}</Heading>
                <Button color="primary" onPress={onCreate}>
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
            <RunnerList onCreate={onCreate} />
        </>
    );
};

/**
 * The create modal lives next to the card, not inside its header: a Section
 * header collects every ActionGroup below it into its action slot, which
 * would swallow the form's submit and cancel buttons.
 */
export const RunnersCard = () => {
    const { reset } = useQueryErrorResetBoundary();
    const createModal = useOverlayController("Modal", {
        reuseControllerFromContext: false,
    });
    return (
        <>
            <LayoutCard>
                <Section>
                    <ErrorBoundary
                        onReset={reset}
                        FallbackComponent={ErrorFallback}
                    >
                        <Suspense fallback={<SkeletonText />}>
                            <Runners onCreate={createModal.open} />
                        </Suspense>
                    </ErrorBoundary>
                </Section>
            </LayoutCard>
            <CreateRunnerModal controller={createModal} />
        </>
    );
};
