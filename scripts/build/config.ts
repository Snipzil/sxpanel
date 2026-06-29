//Configs for the build script (also used in dev)
export default {
    debouncerInterval: 250,
    preReleaseExpirationDays: 21,
    copy: ['docs/', 'fxmanifest.lua', 'entrypoint.js', 'resource/', 'locale/', 'addons/', 'bot/'],
    defaultAddons: [
        {
            id: 'sx-tickets',
            source: 'D:/coding/sx-tickets/addons/sx-tickets',
        },
    ],
};
