import {
    Alert,
    Heading,
    LayoutCard,
    Markdown,
    Section,
} from "@mittwald/flow-remote-react-components";
import RemoteRoot from "@mittwald/flow-remote-react-components/RemoteRoot";
import { Title } from "@mittwald/mstudio-ext-react-components";
import { createFileRoute } from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { RunnersCard } from "@/components/runners/RunnersCard.tsx";
import { useTranslation } from "@/i18n/react.tsx";

export const Route = createFileRoute("/")({
    component: App,
    ssr: false,
});

function App() {
    const t = useTranslation();
    return (
        <RemoteRoot>
            <ErrorBoundary
                fallbackRender={(props) => (
                    <LayoutCard>
                        <ErrorFallback
                            error={props.error}
                            resetErrorBoundary={props.resetErrorBoundary}
                        />
                    </LayoutCard>
                )}
            >
                <Title>{t("app.title")}</Title>
                <Section>
                    <Alert status="info">
                        <Heading>{t("app.dockerNotice.title")}</Heading>
                        <Markdown>{t("app.dockerNotice.text")}</Markdown>
                    </Alert>
                    <RunnersCard />
                </Section>
            </ErrorBoundary>
        </RemoteRoot>
    );
}
