import {
    ActionGroup,
    Button,
    Heading,
    IconSearch,
    IllustratedMessage,
    Link,
    Table,
    TableBody,
    TableCell,
    TableColumn,
    TableHeader,
    TableRow,
    Text,
} from "@mittwald/flow-remote-react-components";
import { useEffect, useState } from "react";
import type { Provider } from "@/generated/extension-api";
import { RunnerClientGhost } from "@/ghosts.ts";
import { RunnerLogsModal } from "./RunnerLogsModal.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

const REFRESH_INTERVAL_MS = 15_000;

const providerLabels: Record<Provider, string> = {
    github: "GitHub Actions",
    gitlab: "GitLab CI",
};

export const RunnerTable = () => {
    const { value: runners, invalidate } =
        RunnerClientGhost.listRunners().useGhost();
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => {
        const timer = setInterval(() => void invalidate(), REFRESH_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [invalidate]);

    const run = async (runnerId: string, action: () => Promise<unknown>) => {
        setBusy(runnerId);
        try {
            await action();
        } finally {
            setBusy(null);
            void invalidate();
        }
    };

    if (runners.length === 0) {
        return (
            <IllustratedMessage>
                <IconSearch />
                <Heading>No runners yet</Heading>
                <Text>
                    Use "Create runner" to add the first CI runner to this
                    project.
                </Text>
            </IllustratedMessage>
        );
    }

    return (
        <Table aria-label="CI runners">
            <TableHeader>
                <TableColumn isRowHeader>Name</TableColumn>
                <TableColumn>CI system</TableColumn>
                <TableColumn>Target</TableColumn>
                <TableColumn>Labels</TableColumn>
                <TableColumn>Size</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody>
                {runners.map((runner) => (
                    <TableRow key={runner.id}>
                        <TableCell>
                            {runner.name}
                            {runner.ephemeral ? " (ephemeral)" : ""}
                        </TableCell>
                        <TableCell>{providerLabels[runner.provider]}</TableCell>
                        <TableCell>
                            <Link href={runner.targetUrl} target="_blank">
                                {runner.target}
                            </Link>
                        </TableCell>
                        <TableCell>{runner.labels.join(", ")}</TableCell>
                        <TableCell>{runner.size}</TableCell>
                        <TableCell>
                            <StatusBadge status={runner.status} />
                        </TableCell>
                        <TableCell>
                            <ActionGroup>
                                <RunnerLogsModal
                                    runnerId={runner.id}
                                    name={runner.name}
                                />
                                <Button
                                    color="secondary"
                                    variant="soft"
                                    size="s"
                                    isDisabled={busy === runner.id}
                                    onPress={() =>
                                        run(runner.id, () =>
                                            RunnerClientGhost.restartRunner({
                                                data: { runnerId: runner.id },
                                            }),
                                        )
                                    }
                                >
                                    Restart
                                </Button>
                                <Button
                                    color="danger"
                                    variant="soft"
                                    size="s"
                                    isDisabled={busy === runner.id}
                                    onPress={() =>
                                        run(runner.id, () =>
                                            RunnerClientGhost.deleteRunner({
                                                data: { runnerId: runner.id },
                                            }),
                                        )
                                    }
                                >
                                    Delete
                                </Button>
                            </ActionGroup>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
