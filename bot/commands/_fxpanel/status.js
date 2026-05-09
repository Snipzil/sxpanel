const { createPersistentEmbedCommand } = require('./persistentEmbedCommand');

module.exports = createPersistentEmbedCommand({
    commandName: 'status',
    description: 'Adds or removes the configurable, persistent, auto-updated embed.',
    addDescription: 'Creates a configurable, persistent, auto-updated embed with server status.',
    removeDescription: 'Removes the configured persistent fxPanel status embed.',
    embedTarget: 'status',
    localeKey: 'status',
});