import { describe, expect, it } from "vitest";
import { cleanReleaseNotes } from "./release-notes.ts";

const REPO = "https://github.com/Hermsi1337/mstudio-ci-runner-extension";

describe("cleanReleaseNotes", () => {
    it("drops HTML comments", () => {
        expect(
            cleanReleaseNotes(
                "<!-- Release notes generated using configuration in .github/release.yml at v0.6.1 -->\n\n## What's Changed",
            ),
        ).toBe("## What's Changed");
    });

    it("shortens bare pull request and issue URLs", () => {
        expect(cleanReleaseNotes(`* fix: thing by @a in ${REPO}/pull/39`)).toBe(
            `* fix: thing by @a in [#39](${REPO}/pull/39)`,
        );
        expect(cleanReleaseNotes(`see ${REPO}/issues/53`)).toBe(
            `see [#53](${REPO}/issues/53)`,
        );
    });

    it("shortens compare URLs to the range", () => {
        expect(
            cleanReleaseNotes(
                `**Full Changelog**: ${REPO}/compare/v0.6.0...v0.6.1`,
            ),
        ).toBe(
            `**Full Changelog**: [v0.6.0...v0.6.1](${REPO}/compare/v0.6.0...v0.6.1)`,
        );
    });

    it("leaves links that are already Markdown alone", () => {
        const linked = `[PR](${REPO}/pull/39) and <${REPO}/pull/40>`;
        expect(cleanReleaseNotes(linked)).toBe(linked);
    });
});
