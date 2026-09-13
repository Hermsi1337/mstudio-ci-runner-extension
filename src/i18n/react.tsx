import { createContext, type ReactNode, useContext, useMemo } from "react";
import {
    defaultLocale,
    type Locale,
    resolveLocale,
    type Translate,
    translator,
} from "./index.ts";

interface LocaleContextValue {
    locale: Locale;
    t: Translate;
}

const LocaleContext = createContext<LocaleContextValue>({
    locale: defaultLocale,
    t: translator(defaultLocale),
});

export function detectBrowserLocale(): Locale {
    if (typeof navigator === "undefined") {
        return defaultLocale;
    }
    return resolveLocale(navigator.languages?.join(",") ?? navigator.language);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
    const value = useMemo(() => {
        const locale = detectBrowserLocale();
        return { locale, t: translator(locale) };
    }, []);
    return (
        <LocaleContext.Provider value={value}>
            {children}
        </LocaleContext.Provider>
    );
}

export function useLocale(): Locale {
    return useContext(LocaleContext).locale;
}

export function useTranslation(): Translate {
    return useContext(LocaleContext).t;
}
