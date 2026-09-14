import { de } from "./de.ts";
import { en } from "./en.ts";

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export type Messages = { [K in keyof typeof en]: string };
export type MessageKey = keyof Messages;
export type MessageParams = Record<string, string | number>;

const catalogs: Record<Locale, Messages> = { en, de };

export function resolveLocale(preference: string | undefined | null): Locale {
    if (!preference) {
        return defaultLocale;
    }
    for (const entry of preference.split(",")) {
        const tag = entry.trim().split(";")[0].toLowerCase();
        const language = tag.split("-")[0] as Locale;
        if (locales.includes(language)) {
            return language;
        }
    }
    return defaultLocale;
}

export function translate(
    locale: Locale,
    key: MessageKey,
    params: MessageParams = {},
): string {
    const template = catalogs[locale][key] ?? catalogs[defaultLocale][key];
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
    );
}

export type Translate = (key: MessageKey, params?: MessageParams) => string;

export function translator(locale: Locale): Translate {
    return (key, params) => translate(locale, key, params);
}
