import {
    Alert,
    Heading,
    Section,
    Text,
} from "@mittwald/flow-remote-react-components";
import { Title } from "@mittwald/mstudio-ext-react-components";
import { createFileRoute } from "@tanstack/react-router";
import { RunnersCard } from "@/components/runners/RunnersCard.tsx";

export const Route = createFileRoute("/")({
    component: App,
    ssr: false,
});

function App() {
    return (
        <>
            <Title>CI Runners</Title>
            <Section>
                <Alert status="info">
                    <Heading>No Docker inside runners</Heading>
                    <Text>
                        Runners run on mittwald Container Hosting without a
                        Docker daemon. GitHub workflows using{" "}
                        <strong>container:</strong>, <strong>services:</strong>{" "}
                        or <strong>docker build</strong> and GitLab jobs relying
                        on <strong>image:</strong> will fail. Plain jobs (Node,
                        PHP, Composer, Python, rsync, SSH deploys) work fine.
                    </Text>
                </Alert>
                <RunnersCard />
            </Section>
        </>
    );
}
