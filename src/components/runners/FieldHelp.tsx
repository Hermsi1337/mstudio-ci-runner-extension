import {
    Button,
    ContextualHelp,
    ContextualHelpTrigger,
    Link,
    Text,
} from "@mittwald/flow-remote-react-components";
import { useTranslation } from "@/i18n/react.tsx";

interface FieldHelpProps {
    subject: string;
    text: string;
    link?: { href: string; label: string };
}

export const FieldHelp = ({ subject, text, link }: FieldHelpProps) => {
    const t = useTranslation();
    return (
        <ContextualHelpTrigger>
            <Button aria-label={t("help.open", { subject })} />
            <ContextualHelp>
                {text.split("\n").map((paragraph) => (
                    <Text key={paragraph}>{paragraph}</Text>
                ))}
                {link && (
                    <Link href={link.href} target="_blank">
                        {link.label}
                    </Link>
                )}
            </ContextualHelp>
        </ContextualHelpTrigger>
    );
};
