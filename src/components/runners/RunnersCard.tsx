import {
    Header,
    Heading,
    LayoutCard,
    Section,
    SkeletonText,
    Text,
} from "@mittwald/flow-remote-react-components";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorFallback } from "@/components/ErrorFallback.tsx";
import { useTranslation } from "@/i18n/react.tsx";
import { CreateRunnerModal } from "./CreateRunnerModal.tsx";
import { RunnerTable } from "./RunnerTable.tsx";

export const RunnersCard = () => {
    const t = useTranslation();
    return (
        <LayoutCard>
            <Section>
                <Header>
                    <Heading>{t("runners.heading")}</Heading>
                    <CreateRunnerModal />
                </Header>
                <Text>{t("runners.intro")}</Text>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Suspense fallback={<SkeletonText />}>
                        <RunnerTable />
                    </Suspense>
                </ErrorBoundary>
            </Section>
        </LayoutCard>
    );
};
