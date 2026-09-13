import { describe, expect, it } from "vitest";
import { rewriteForLocalHost } from "./local-host-plugin.ts";

describe("rewriteForLocalHost", () => {
    it("swaps remote Flow components for the DOM-rendering ones", () => {
        const code = [
            'import { Button } from "@mittwald/flow-remote-react-components";',
            'import { Form } from "@mittwald/flow-remote-react-components/react-hook-form";',
        ].join("\n");
        expect(rewriteForLocalHost(code)).toBe(
            [
                'import { Button } from "@mittwald/flow-react-components";',
                'import { Form } from "@mittwald/flow-react-components/react-hook-form";',
            ].join("\n"),
        );
    });

    it("prefixes imports of other UI modules and leaves the rest alone", () => {
        const code = [
            'import { RunnerForm } from "./RunnerForm.tsx";',
            'import { ErrorFallback } from "@/components/ErrorFallback.tsx";',
            'import { useFormErrorHandling } from "@/hooks/useFormErrorHandling.tsx";',
            'import { RunnerClientGhost } from "@/ghosts.ts";',
            'import { useTranslation } from "@/i18n/react.tsx";',
            'import type { Runner } from "@/generated/extension-api";',
        ].join("\n");
        expect(rewriteForLocalHost(code)).toBe(
            [
                'import { RunnerForm } from "local:./RunnerForm.tsx";',
                'import { ErrorFallback } from "local:@/components/ErrorFallback.tsx";',
                'import { useFormErrorHandling } from "local:@/hooks/useFormErrorHandling.tsx";',
                'import { RunnerClientGhost } from "@/ghosts.ts";',
                'import { useTranslation } from "@/i18n/react.tsx";',
                'import type { Runner } from "@/generated/extension-api";',
            ].join("\n"),
        );
    });
});
