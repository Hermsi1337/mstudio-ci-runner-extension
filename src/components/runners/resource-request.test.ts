import { describe, expect, it } from "vitest";
import { toResourceFormValues, toResourceRequest } from "./resource-request.ts";

const custom = { size: "custom" as const, cpus: 1.5, memoryGb: 3 };

describe("toResourceRequest", () => {
    it.each([
        {
            noCpuLimit: false,
            noMemoryLimit: false,
            expected: { cpus: 1.5, memoryMb: 3072 },
        },
        {
            noCpuLimit: true,
            noMemoryLimit: false,
            expected: { cpus: null, memoryMb: 3072 },
        },
        {
            noCpuLimit: false,
            noMemoryLimit: true,
            expected: { cpus: 1.5, memoryMb: null },
        },
        {
            noCpuLimit: true,
            noMemoryLimit: true,
            expected: { cpus: null, memoryMb: null },
        },
    ])(
        "sends noCpuLimit $noCpuLimit and noMemoryLimit $noMemoryLimit",
        ({ expected, ...flags }) => {
            expect(toResourceRequest({ ...custom, ...flags })).toStrictEqual({
                size: "custom",
                ...expected,
            });
        },
    );

    it("sends only the size of a preset", () => {
        expect(
            toResourceRequest({
                ...custom,
                size: "large",
                noCpuLimit: true,
                noMemoryLimit: true,
            }),
        ).toStrictEqual({ size: "large" });
    });
});

describe("toResourceFormValues", () => {
    it("checks the boxes of missing limits and keeps a number behind them", () => {
        expect(
            toResourceFormValues({
                size: "custom",
                cpus: null,
                memoryMb: 4096,
            }),
        ).toEqual({
            size: "custom",
            cpus: 1,
            noCpuLimit: true,
            memoryGb: 4,
            noMemoryLimit: false,
        });
    });

    it("round-trips every checkbox combination", () => {
        for (const cpus of [1.5, null]) {
            for (const memoryMb of [3072, null]) {
                const values = toResourceFormValues({
                    size: "custom",
                    cpus,
                    memoryMb,
                });
                expect(toResourceRequest(values)).toStrictEqual({
                    size: "custom",
                    cpus,
                    memoryMb,
                });
            }
        }
    });
});
