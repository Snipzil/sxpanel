import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { LocaleType } from '@shared/localeMap';
import { panelLanguageAtom } from '@/hooks/panelLanguage';
import { useAuthedFetcher } from '@/hooks/fetch';
import { englishLocale, loadPanelLocale, normalizePanelLangCode } from '@/lib/panelLocaleLoader';

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

const resolveBrowserLang = (): string => {
    const lang = Array.isArray(window.txBrowserLocale) ? window.txBrowserLocale[0] : window.txBrowserLocale;
    return normalizePanelLangCode(lang);
};

const interpolate = (value: string, tOptions?: Record<string, string | number>): string => {
    if (!tOptions) return value;
    return value.replace(/%\{(\w+)\}/g, (_, key: string) => {
        const option = tOptions[key];
        return option !== undefined ? String(option) : `%{${key}}`;
    });
};

export const useLocale = () => {
    const settingsLang = useAtomValue(panelLanguageAtom);
    const authedFetcher = useAuthedFetcher();
    const [customLocale, setCustomLocale] = useState<LocaleType | null>(null);
    const [loadedLocale, setLoadedLocale] = useState<LocaleType>(englishLocale);

    const currentLang = useMemo(() => {
        if (settingsLang) return normalizePanelLangCode(settingsLang);
        return resolveBrowserLang();
    }, [settingsLang]);

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
        loadPanelLocale(currentLang)
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

    useEffect(() => {
        if (currentLang !== 'custom') {
            setCustomLocale(null);
            return;
        }

        let cancelled = false;
        authedFetcher<{ phrases: LocaleType } | { error: string }>('/settings/localePhrases')
            .then((resp) => {
                if (!cancelled && resp && 'phrases' in resp) {
                    setCustomLocale(resp.phrases);
                }
            })
            .catch(() => {
                if (!cancelled) setCustomLocale(null);
            });

        return () => {
            cancelled = true;
        };
    }, [currentLang, authedFetcher]);

    const locale = useMemo(() => {
        if (currentLang === 'custom' && customLocale) {
            return mergeLocaleFallback(englishLocale, customLocale as Record<string, unknown>);
        }

        return loadedLocale;
    }, [currentLang, customLocale, loadedLocale]);

    const t = useCallback(
        (key: string, tOptions?: Record<string, string | number>, defaultValue?: string): string => {
            const keys = key.split('.');
            let value: unknown = locale;

            for (const k of keys) {
                if (isObject(value) && k in value) {
                    value = value[k];
                } else {
                    return defaultValue ?? key;
                }
            }

            if (typeof value !== 'string') {
                return defaultValue ?? key;
            }

            return interpolate(value, tOptions);
        },
        [locale],
    );

    return useMemo(() => ({ locale, currentLang, t }), [locale, currentLang, t]);
};
