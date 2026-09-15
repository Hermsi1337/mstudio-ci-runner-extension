import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./version-compare.ts";

describe("isNewerVersion", () => {
    it.each([
        ["0.2.0", "0.1.0", true],
        ["1.0.0", "0.9.9", true],
        ["0.1.10", "0.1.9", true],
        ["0.1.0", "0.1.0", false],
        ["0.1.0", "0.2.0", false],
        ["0.9.9", "1.0.0", false],
    ])("candidate %s vs current %s -> %s", (candidate, current, expected) => {
        expect(isNewerVersion(candidate, current)).toBe(expected);
    });

    it("treats unparsable versions as not newer", () => {
        expect(isNewerVersion("abc", "0.1.0")).toBe(false);
        expect(isNewerVersion("0.2.0", "abc")).toBe(false);
    });
});
