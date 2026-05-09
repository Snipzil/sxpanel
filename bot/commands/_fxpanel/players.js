const { createPersistentEmbedCommand } = require('./persistentEmbedCommand');

module.exports = createPersistentEmbedCommand({
    commandName: 'players',
    description: 'Adds or removes the configurable, persistent, auto-updated player list embed.',
    addDescription: 'Creates a configurable, persistent, auto-updated embed with the live server player list.',
    removeDescription: 'Removes the configured persistent fxPanel player list embed.',
    embedTarget: 'playerList',
    localeKey: 'player_list',
});