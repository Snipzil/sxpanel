const fallbackLocale = require('../locale/en.json').discord_bot ?? {};

const isObject = (value) => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const getNestedValue = (input, dottedKey) => {
    let cursor = input;

    for (const segment of dottedKey.split('.')) {
        if (!isObject(cursor) || !(segment in cursor)) {
            return undefined;
        }
 
        cursor = cursor[segment];
    }

    return cursor;
};

const getDiscordLocale = (source) => {
    const client = source?.client ?? source;
    const runtimeLocale = client?.fxpanel?.latestConfigSnapshot?.discordBotLocale;
    return isObject(runtimeLocale) ? runtimeLocale : fallbackLocale;
};

const translateDiscord = (source, key, params = {}) => {
    const template = getNestedValue(getDiscordLocale(source), key);
    if (typeof template !== 'string') {
        return key;
    }

    return template.replace(/%\{(.*?)\}/g, (_, token) => {
        const value = params[token];
        return value === undefined || value === null ? '' : String(value);
    });
};

module.exports = {
    getDiscordLocale,
    translateDiscord,
};