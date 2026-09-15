import { siGithub, siGitlab } from "simple-icons";
import type { Provider } from "@/generated/extension-api";

// The marks sit on a white rounded tile so the near-black GitHub logo stays
// visible on the dark theme.
function toDataUri(icon: { path: string; hex: string }): string {
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
        '<rect width="24" height="24" rx="5" fill="#ffffff"/>' +
        `<path transform="translate(3 3) scale(0.75)" fill="#${icon.hex}" d="${icon.path}"/>` +
        "</svg>";

    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const providerLogos: Record<Provider, string> = {
    github: toDataUri(siGithub),
    gitlab: toDataUri(siGitlab),
};
