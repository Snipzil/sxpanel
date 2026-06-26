import type { LocaleType } from '@shared/localeMap';
import langEn from '@locale/en.json';

export const NUI_LOCALE_CODES = [
    'ar',
    'bg',
    'bs',
    'cs',
    'da',
    'de',
    'el',
    'en',
    'es',
    'et',
    'fa',
    'fi',
    'fr',
    'hr',
    'hu',
    'id',
    'it',
    'ja',
    'lt',
    'lv',
    'mn',
    'ne',
    'nl',
    'no',
    'pl',
    'pt',
    'ro',
    'ru',
    'sl',
    'sv',
    'th',
    'tr',
    'uk',
    'vi',
    'zh',
] as const;

export type NuiLocaleCode = (typeof NUI_LOCALE_CODES)[number];

const nuiLocaleCodeSet = new Set<string>(NUI_LOCALE_CODES);

const isNuiLocaleCode = (code: string): code is NuiLocaleCode => nuiLocaleCodeSet.has(code);

const localeImportByCode: Record<Exclude<NuiLocaleCode, 'en'>, () => Promise<{ default: Record<string, unknown> }>> = {
    ar: () => import('@locale/ar.json'),
    bg: () => import('@locale/bg.json'),
    bs: () => import('@locale/bs.json'),
    cs: () => import('@locale/cs.json'),
    da: () => import('@locale/da.json'),
    de: () => import('@locale/de.json'),
    el: () => import('@locale/el.json'),
    es: () => import('@locale/es.json'),
    et: () => import('@locale/et.json'),
    fa: () => import('@locale/fa.json'),
    fi: () => import('@locale/fi.json'),
    fr: () => import('@locale/fr.json'),
    hr: () => import('@locale/hr.json'),
    hu: () => import('@locale/hu.json'),
    id: () => import('@locale/id.json'),
    it: () => import('@locale/it.json'),
    ja: () => import('@locale/ja.json'),
    lt: () => import('@locale/lt.json'),
    lv: () => import('@locale/lv.json'),
    mn: () => import('@locale/mn.json'),
    ne: () => import('@locale/ne.json'),
    nl: () => import('@locale/nl.json'),
    no: () => import('@locale/no.json'),
    pl: () => import('@locale/pl.json'),
    pt: () => import('@locale/pt.json'),
    ro: () => import('@locale/ro.json'),
    ru: () => import('@locale/ru.json'),
    sl: () => import('@locale/sl.json'),
    sv: () => import('@locale/sv.json'),
    th: () => import('@locale/th.json'),
    tr: () => import('@locale/tr.json'),
    uk: () => import('@locale/uk.json'),
    vi: () => import('@locale/vi.json'),
    zh: () => import('@locale/zh.json'),
};

export const englishLocale = langEn as LocaleType;

const loadedLocales = new Map<string, LocaleType>();

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

export const normalizeNuiLangCode = (lang: string | undefined): string => {
    if (!lang) return 'en';
    if (lang === 'custom') return 'custom';
    if (isNuiLocaleCode(lang)) return lang;
    const baseLang = lang.split(/[-_]/)[0].toLowerCase();
    if (isNuiLocaleCode(baseLang)) return baseLang;
    return 'en';
};

export const loadNuiLocale = async (lang: string): Promise<LocaleType> => {
    const normalized = normalizeNuiLangCode(lang);
    if (normalized === 'en' || normalized === 'custom') return englishLocale;

    const cached = loadedLocales.get(normalized);
    if (cached) return cached;

    const importer = localeImportByCode[normalized as Exclude<NuiLocaleCode, 'en'>];
    if (!importer) return englishLocale;

    const mod = await importer();
    const merged = mergeLocaleFallback(englishLocale, mod.default);
    loadedLocales.set(normalized, merged);
    return merged;
};
