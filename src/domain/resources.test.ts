import { describe, expect, it } from "vitest";
import { resolveResources, resourceLimits } from "@/domain/resources.ts";

describe("resolveResources", () => {
    it("takes the limits of a preset", () => {
        expect(
            resolveResources({ size: "large", cpus: null, memoryMb: null }),
        ).toEqual({ size: "large", cpus: 2, memoryMb: 4096 });
    });

    it("falls back to medium without a size", () => {
        expect(resolveResources({})).toEqual({
            size: "medium",
            cpus: 1,
            memoryMb: 2048,
        });
    });

    it.each([
        { cpus: 1.5, memoryMb: 3072 },
        { cpus: null, memoryMb: 3072 },
        { cpus: 1.5, memoryMb: null },
        { cpus: null, memoryMb: null },
    ])("keeps custom cpus $cpus and memoryMb $memoryMb", (limits) => {
        expect(resolveResources({ size: "custom", ...limits })).toEqual({
            size: "custom",
            ...limits,
        });
    });

    it("reads a missing custom value as no limit", () => {
        expect(resolveResources({ size: "custom", memoryMb: 4096 })).toEqual({
            size: "custom",
            cpus: null,
            memoryMb: 4096,
        });
    });
});

describe("resourceLimits", () => {
    it.each([
        {
            cpus: 1.5,
            memoryMb: 3072,
            expected: { cpus: "1.5", memory: "3072mb" },
        },
        { cpus: null, memoryMb: 3072, expected: { memory: "3072mb" } },
        { cpus: 1.5, memoryMb: null, expected: { cpus: "1.5" } },
        { cpus: null, memoryMb: null, expected: undefined },
    ])(
        "declares cpus $cpus and memoryMb $memoryMb",
        ({ cpus, memoryMb, expected }) => {
            expect(resourceLimits({ size: "custom", cpus, memoryMb })).toEqual(
                expected,
            );
        },
    );
});
