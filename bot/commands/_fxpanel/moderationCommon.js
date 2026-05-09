const addTargetSubcommands = (
    container,
    descriptions,
    configureSubcommand = (subcommand) => subcommand,
    options = {},
) => {
    const includeSelf = options.includeSelf === true;

    if (includeSelf) {
        container.addSubcommand((subcommand) => {
            return configureSubcommand(
                subcommand.setName('self').setDescription(descriptions.self ?? 'Targets your linked Discord identifier.'),
            );
        });
    }

    container.addSubcommand((subcommand) => {
        return configureSubcommand(
            subcommand
                .setName('member')
                .setDescription(descriptions.member)
                .addUserOption((option) => {
                    return option
                        .setName('member')
                        .setDescription('Discord member to target.')
                        .setRequired(true);
                }),
        );
    });

    container.addSubcommand((subcommand) => {
        return configureSubcommand(
            subcommand
                .setName('id')
                .setDescription(descriptions.id)
                .addStringOption((option) => {
                    return option
                        .setName('id')
                        .setDescription('Identifier to target (for example license:..., fivem:..., discord:...).')
                        .setRequired(true)
                        .setMinLength(5);
                }),
        );
    });

    container.addSubcommand((subcommand) => {
        return configureSubcommand(
            subcommand
                .setName('serverid')
                .setDescription(descriptions.serverid ?? 'Targets a connected player by their current server ID.')
                .addIntegerOption((option) => {
                    return option
                        .setName('serverid')
                        .setDescription('Current in-server player ID to target.')
                        .setRequired(true)
                        .setMinValue(1);
                }),
        );
    });

    return container;
};

module.exports = {
    addTargetSubcommands,
};