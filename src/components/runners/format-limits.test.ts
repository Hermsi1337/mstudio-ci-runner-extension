import { describe, expect, it } from "vitest";
import { translator } from "@/i18n/index.ts";
import { formatLimits } from "./format-limits.ts";

describe("formatLimits", () => {
    it.each([
        {
            cpus: 1.5,
            memoryGb: 4,
            en: "1.5 CPU, 4 GB RAM",
            de: "1,5 CPU, 4 GB RAM",
        },
        {
            cpus: null,
            memoryGb: 4,
            en: "no CPU limit, 4 GB RAM",
            de: "kein CPU-Limit, 4 GB RAM",
        },
        {
            cpus: 2,
            memoryGb: null,
            en: "2 CPU, no memory limit",
            de: "2 CPU, kein Speicherlimit",
        },
        { cpus: null, memoryGb: null, en: "no limits", de: "keine Limits" },
    ])("names cpus $cpus and memoryGb $memoryGb", ({ en, de, ...limits }) => {
        expect(formatLimits(translator("en"), "form.size.limits", limits)).toBe(
            en,
        );
        expect(formatLimits(translator("de"), "form.size.limits", limits)).toBe(
            de,
        );
    });

    it("phrases the summary sentence", () => {
        expect(
            formatLimits(translator("en"), "form.summary.service.text", {
                cpus: null,
                memoryGb: 4,
            }),
        ).toBe("Limited to 4 GB RAM, no CPU limit.");
    });
});
