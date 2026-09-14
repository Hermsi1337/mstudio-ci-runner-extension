import { describe, expect, it } from "vitest";
import { parseConfigCommand } from "./parseConfigCommand.ts";

describe("parseConfigCommand", () => {
    it("reads url and token from the Linux command", () => {
        expect(
            parseConfigCommand(
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
                './config.cmd --url "https://github.com/acme/" --token AEBIHM56SBF3SULYYYY3BH3KU333M --name x',
            ),
        ).toEqual({
            target: "https://github.com/acme",
            token: "AEBIHM56SBF3SULYYYY3BH3KU333M",
        });
    });

    it("rejects input without url or token", () => {
        expect(parseConfigCommand("AEBIHM56SBF3SULYYYY3BH3KU333M")).toBeNull();
        expect(
            parseConfigCommand("./config.sh --url https://github.com/acme/app"),
        ).toBeNull();
    });
});
