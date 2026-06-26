import { useEffect, useMemo, useState } from 'react';
import { useServerCtxValue } from '../state/server.state';
import type { LocaleType } from '@shared/localeMap';
import { englishLocale, loadNuiLocale, normalizeNuiLangCode } from '../lib/nuiLocaleLoader';

const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const mergeLocaleFallback = <T extends Record<string, unknown>>(fallback: T, target?: Record<string, unknown>): T => {
    if (!target) return fallback;

    const mergedEntries = Object.entries(fallback).map(([key, fallbackValue]) => {
        const targetValue = target[key];

        if (isObject(fallbackValue)) {
            return [key, mergeLocaleFallback(fallbackValue, isObject(targetValue) ? targetValue : undefined)];
        }

        return [key, targetValue ?? fallbackValue];
    });

    return Object.fromEntries(mergedEntries) as T;
};

export const useLocale = () => {
    const serverCtx = useServerCtxValue();
    const [loadedLocale, setLoadedLocale] = useState<LocaleType>(englishLocale);

    const currentLang = useMemo(() => normalizeNuiLangCode(serverCtx.locale), [serverCtx.locale]);

    useEffect(() => {
        if (currentLang === 'custom') {
            setLoadedLocale(englishLocale);
            return;
        }

        if (currentLang === 'en') {
            setLoadedLocale(englishLocale);
            return;
        }

        let cancelled = false;
        loadNuiLocale(currentLang)
            .then((locale) => {
                if (!cancelled) setLoadedLocale(locale);
            })
            .catch(() => {
                if (!cancelled) setLoadedLocale(englishLocale);
            });

        return () => {
            cancelled = true;
        };
    }, [currentLang]);

    return useMemo(() => {
        if (serverCtx.locale === 'custom' && typeof serverCtx.localeData === 'object') {
            return mergeLocaleFallback(englishLocale, serverCtx.localeData);
        }

        if (loadedLocale) {
            return loadedLocale;
        }

        console.log(`Unable to find a locale with code ${serverCtx.locale} in cache, using English`);
        return englishLocale;
    }, [serverCtx.locale, serverCtx.localeData, loadedLocale]);
};
