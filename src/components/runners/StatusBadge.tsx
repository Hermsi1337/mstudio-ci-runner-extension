import { Badge } from "@mittwald/flow-remote-react-components";
import type { RunnerStatus } from "@/generated/extension-api";

type BadgeColor = "green" | "orange" | "red" | "neutral" | "blue";

const colors: Partial<Record<RunnerStatus, BadgeColor>> = {
    running: "green",
    starting: "blue",
    creating: "blue",
    stopped: "neutral",
    error: "red",
    missing: "red",
};

const labels: Partial<Record<RunnerStatus, string>> = {
    running: "Running",
    starting: "Starting",
    creating: "Creating",
    stopped: "Stopped",
    error: "Error",
    missing: "Stack missing",
};

export const StatusBadge = ({ status }: { status: RunnerStatus }) => (
    <Badge color={colors[status] ?? "neutral"}>
        {labels[status] ?? status}
    </Badge>
);
