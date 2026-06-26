const PLACEHOLDER_TOKEN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

const PREVIEW_FALLBACK_SAMPLES: Record<string, string> = {
    index: '1',
    netid: '1',
    displayName: 'Preview Player 1',
    pureName: 'Preview_Player_1',
    license: 'license:preview0001',
    playTimeMinutes: '48',
    playTime: '48 mins',
    sessionTimeSeconds: '120',
    sessionTimeMinutes: '2',
    sessionTime: '2 mins',
    tags: 'vip, staff',
};

export const generatePreviewFallback = (key: string) => {
    if (key in PREVIEW_FALLBACK_SAMPLES) {
        return PREVIEW_FALLBACK_SAMPLES[key];
    }

    const spaced = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .trim();
    if (!spaced.length) return key;
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

export const substitutePlaceholders = (input: string, placeholders: Record<string, unknown>) => {
    let output = input;
    for (const [key, value] of Object.entries(placeholders)) {
        output = output.replaceAll(`{{${key}}}`, String(value));
    }

    output = output.replace(PLACEHOLDER_TOKEN, (_match, key: string) => {
        if (key in placeholders) {
            return String(placeholders[key]);
        }
        return generatePreviewFallback(key);
    });

    return output;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

export const substitutePlaceholdersDeep = (value: unknown, placeholders: Record<string, unknown>): unknown => {
    if (typeof value === 'string') {
        return substitutePlaceholders(value, placeholders);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => substitutePlaceholdersDeep(entry, placeholders));
    }
    if (isPlainObject(value)) {
        const output: Record<string, unknown> = {};
        for (const [key, entry] of Object.entries(value)) {
            output[key] = substitutePlaceholdersDeep(entry, placeholders);
        }
        return output;
    }
    return value;
};
