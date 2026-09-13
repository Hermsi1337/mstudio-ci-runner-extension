import {
    Alert,
    Heading,
    Section,
    Text,
} from "@mittwald/flow-remote-react-components";
import { Title } from "@mittwald/mstudio-ext-react-components";
import { createFileRoute } from "@tanstack/react-router";
import { RunnersCard } from "@/components/runners/RunnersCard.tsx";
import { useTranslation } from "@/i18n/react.tsx";

export const Route = createFileRoute("/")({
    component: App,
    ssr: false,
});

function App() {
    const t = useTranslation();
    return (
        <>
            <Title>{t("app.title")}</Title>
            <Section>
                <Alert status="info">
                    <Heading>{t("app.dockerNotice.title")}</Heading>
                    <Text>{t("app.dockerNotice.text")}</Text>
                </Alert>
                <RunnersCard />
            </Section>
        </>
    );
}
