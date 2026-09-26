/**
 * GitHub renders release bodies with its own Markdown dialect: HTML comments
 * stay invisible and bare pull request URLs become short references. Flow's
 * Markdown shows both verbatim, so the notes get the same treatment first.
 */
const HTML_COMMENT = /<!--[\s\S]*?-->\s*/g;
const BARE_GITHUB_URL =
    /(?<![(\]<])https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(pull|issues|compare)\/([\w.-]+)/g;

export function cleanReleaseNotes(notes: string): string {
    return notes
        .replace(HTML_COMMENT, "")
        .replace(BARE_GITHUB_URL, (url, kind: string, ref: string) =>
            kind === "compare" ? `[${ref}](${url})` : `[#${ref}](${url})`,
        )
        .trim();
}
