import localeMap from '@shared/localeMap';

type PlainObject = Record<string, unknown>;
type DiscordLocaleParams = Record<string, unknown>;

const isObject = (value: unknown): value is PlainObject => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const mergeLocaleFallback = <T extends PlainObject>(fallback: T, target?: PlainObject): T => {
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

const getNestedValue = (input: PlainObject, dottedKey: string) => {
    let cursor: unknown = input;

    for (const segment of dottedKey.split('.')) {
        if (!isObject(cursor) || !(segment in cursor)) {
            return undefined;
        }

        cursor = cursor[segment];
    }

    return cursor;
};

const formatLocaleString = (template: string, params: DiscordLocaleParams = {}) => {
    return template.replace(/%\{(.*?)\}/g, (_, key) => {
        const value = params[key];
        return value === undefined || value === null ? '' : String(value);
    });
};

const getFallbackDiscordLocale = () => {
    const englishLocale = localeMap.en as unknown as PlainObject;
    return isObject(englishLocale.discord_bot) ? englishLocale.discord_bot : {};
};

const getSelectedDiscordLocale = () => {
    try {
        const phrases = txCore.translator.getLanguagePhrases(txConfig.general.language) as PlainObject;
        return isObject(phrases?.discord_bot) ? phrases.discord_bot : undefined;
    } catch {
        return undefined;
    }
};

export const getDiscordLocale = () => {
    return mergeLocaleFallback(getFallbackDiscordLocale(), getSelectedDiscordLocale());
};

export const getDiscordLocaleSnapshot = () => {
    return structuredClone(getDiscordLocale());
};

export const translateDiscord = (key: string, params: DiscordLocaleParams = {}) => {
    const template = getNestedValue(getDiscordLocale(), key);
    return typeof template === 'string' ? formatLocaleString(template, params) : key;
};