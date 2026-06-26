type TranslateFn = (key: string, tOptions?: Record<string, string | number>) => string;

export const translateApiError = (t: TranslateFn, errorCode?: string, fallbackError?: string): string => {
    if (errorCode) {
        const key = errorCode.startsWith('panel.api_errors.') ? errorCode : `panel.api_errors.${errorCode}`;
        const translated = t(key);
        if (translated !== key) return translated;
    }
    return fallbackError ?? 'Unknown error';
};
