import {
    Button,
    ContextualHelp,
    ContextualHelpTrigger,
    Link,
    Markdown,
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
                <Markdown>{text.replaceAll("\n", "\n\n")}</Markdown>
                {link && (
                    <Link href={link.href} target="_blank">
                        {link.label}
                    </Link>
                )}
            </ContextualHelp>
        </ContextualHelpTrigger>
    );
};
