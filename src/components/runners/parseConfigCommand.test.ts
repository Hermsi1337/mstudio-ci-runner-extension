import { describe, expect, it } from "vitest";
import { parseConfigCommand } from "./parseConfigCommand.ts";

describe("parseConfigCommand", () => {
    it("reads url and token from the Linux command", () => {
        expect(
            parseConfigCommand(
                "github",
                "./config.sh --url https://github.com/acme/app --token AEBIHM56SBF3SULYYYY3BH3KU333M",
            ),
        ).toEqual({
            target: "https://github.com/acme/app",
            token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
        });
    });

    it("accepts the Windows command, organizations and extra flags", () => {
        expect(
            parseConfigCommand(
                "github",
                './config.cmd --url "https://github.com/acme/" --token AEBIHM56SBF3SULYYYY3BH3KU333M --name x',
            ),
        ).toEqual({
            target: "https://github.com/acme",
            token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
        });
    });

    it("rejects input without url or token", () => {
        expect(
            parseConfigCommand("github", "AEBIHM56SBF3SULYYYY3BH3KU333M"),
        ).toBeNull();
        expect(
            parseConfigCommand(
                "github",
                "./config.sh --url https://github.com/acme/app",
            ),
        ).toBeNull();
    });

    it("reads instance url and runner token from the GitLab command", () => {
        expect(
            parseConfigCommand(
                "gitlab",
                "gitlab-runner register  --url https://gitlab.example.com/  --token glrt-t1_AbCdEfGhIjKlMnOpQrSt",
            ),
        ).toEqual({
            target: "https://gitlab.example.com",
            token: "glrt-t1_AbCdEfGhIjKlMnOpQrSt",
        });
        expect(
            parseConfigCommand(
                "gitlab",
                "gitlab-runner register --url https://gitlab.com --token glpat-notarunnertoken",
            ),
        ).toBeNull();
    });

    it("keeps the dotted suffix of a GitLab runner token", () => {
        expect(
            parseConfigCommand(
                "gitlab",
                "gitlab-runner register  --url https://gitlab.com  --token glrt-8D541XbfrvFvo5FdcSPUu2M6MQpvOjEKcDpoYXY2NQp0OjMKdTo5ZGVzGg.02.3m0efevhc",
            ),
        ).toEqual({
            target: "https://gitlab.com",
            token: "glrt-8D541XbfrvFvo5FdcSPUu2M6MQpvOjEKcDpoYXY2NQp0OjMKdTo5ZGVzGg.02.3m0efevhc",
        });
    });

    it("has no pattern for Forgejo, which shows no command", () => {
        expect(
            parseConfigCommand(
                "forgejo",
                "forgejo-runner register --instance https://forgejo.example.com --token abc",
            ),
        ).toBeNull();
    });
});
