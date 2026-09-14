import { Alert, Text } from "@mittwald/flow-remote-react-components";
import type { Provider } from "@/generated/extension-api";
import { useTranslation } from "@/i18n/react.tsx";
import { parseConfigCommand } from "./parseConfigCommand.ts";

function maskToken(token: string): string {
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

/**
 * Echoes what the form read out of a pasted setup command, so the user sees
 * the target and a masked token before submitting.
 */
export const ParsedCommand = ({
    provider,
    command,
}: {
    provider: Provider;
    command: string;
}) => {
    const t = useTranslation();
    const parsed = parseConfigCommand(provider, command);
    if (!parsed) {
        return null;
    }
    return (
        <Alert status="success">
            <Text>
                {t("form.configCommand.parsed", {
                    target: parsed.target.replace(/^https?:\/\//, ""),
                    token: maskToken(parsed.token),
                })}
            </Text>
        </Alert>
    );
};
