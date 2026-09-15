import { describe, expect, it } from "vitest";
import { de } from "./de.ts";
import { en } from "./en.ts";
import { resolveLocale, translate } from "./index.ts";

describe("i18n", () => {
    it("has the same keys in every catalog", () => {
        expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
    });

    it("keeps placeholders consistent between catalogs", () => {
        for (const key of Object.keys(en) as (keyof typeof en)[]) {
            const placeholders = (text: string) =>
                [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
            expect(placeholders(de[key])).toEqual(placeholders(en[key]));
        }
    });

    it("resolves Accept-Language style preferences", () => {
        expect(resolveLocale("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
        expect(resolveLocale("fr-FR,en-US;q=0.8")).toBe("en");
        expect(resolveLocale("fr")).toBe("en");
        expect(resolveLocale(undefined)).toBe("en");
    });

    it("interpolates parameters", () => {
        expect(translate("de", "error.gitlab.status", { status: 500 })).toBe(
            "GitLab hat mit Status 500 geantwortet.",
        );
        expect(translate("en", "runners.logs.heading", { name: "ci" })).toBe(
            "Logs: ci",
        );
    });

    it("formats numbers for the locale", () => {
        const custom = { cpus: 0.5, memory: 1.5 };
        expect(translate("de", "form.size.customValue", custom)).toBe(
            "Individuell (0,5 CPU, 1,5 GB RAM)",
        );
        expect(translate("en", "form.size.customValue", custom)).toBe(
            "Custom (0.5 CPU, 1.5 GB RAM)",
        );
    });
});
