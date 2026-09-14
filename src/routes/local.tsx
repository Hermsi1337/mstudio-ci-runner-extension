import "@mittwald/flow-react-components/all.css";
import { ErrorFallback } from "local:@/components/ErrorFallback.tsx";
import { RunnersCard } from "local:@/components/runners/RunnersCard.tsx";
import {
    Alert,
    Heading,
    LayoutCard,
    Markdown,
    Section,
    Text,
} from "@mittwald/flow-react-components";
import { createFileRoute } from "@tanstack/react-router";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "@/i18n/react.tsx";
import { enableLocalMode } from "@/local-mode.ts";

export const Route = createFileRoute("/local")({
    component: LocalApp,
    ssr: false,
    beforeLoad: () => enableLocalMode(),
});

function LocalApp() {
    const t = useTranslation();
    return (
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
            <Section>
                <Heading level={1}>{t("app.title")}</Heading>
                <Alert status="warning">
                    <Heading>{t("local.heading")}</Heading>
                    <Text>{t("local.text")}</Text>
                </Alert>
                <Alert status="info">
                    <Heading>{t("app.dockerNotice.title")}</Heading>
                    <Markdown>{t("app.dockerNotice.text")}</Markdown>
                </Alert>
                <RunnersCard />
            </Section>
        </ErrorBoundary>
    );
}
