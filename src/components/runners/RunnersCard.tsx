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
import { CreateRunnerModal } from "./CreateRunnerModal.tsx";
import { RunnerTable } from "./RunnerTable.tsx";

export const RunnersCard = () => (
    <LayoutCard>
        <Section>
            <Header>
                <Heading>Runners</Heading>
                <CreateRunnerModal />
            </Header>
            <Text>
                Each runner is its own container stack in this project and
                registers itself with GitHub or GitLab on start. Deleting a
                runner removes its registration.
            </Text>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
                <Suspense fallback={<SkeletonText />}>
                    <RunnerTable />
                </Suspense>
            </ErrorBoundary>
        </Section>
    </LayoutCard>
);
