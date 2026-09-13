import { Badge } from "@mittwald/flow-remote-react-components";
import type { RunnerStatus } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";

type BadgeColor = "green" | "orange" | "red" | "neutral" | "blue";

const colors: Partial<Record<RunnerStatus, BadgeColor>> = {
    running: "green",
    starting: "blue",
    creating: "blue",
    stopping: "orange",
    stopped: "neutral",
    error: "red",
    missing: "red",
};

export const StatusBadge = ({ status }: { status: RunnerStatus }) => {
    const t = useTranslation();
    return (
        <Badge color={colors[status] ?? "neutral"}>
            {t(`status.${status}`)}
        </Badge>
    );
};
