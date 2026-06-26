export const discordSnowflakePattern = /^\d{17,20}$/;

export const normalizeRoleIdsInput = (value: string) => {
    const roleIds = value.split(/[\n,;\s]+/).reduce<string[]>((ids, rawToken) => {
        const token = rawToken.trim();
        if (!token.length) {
            return ids;
        }

        ids.push(token.match(/\d{17,20}/)?.[0] ?? token);
        return ids;
    }, []);

    return [...new Set(roleIds)];
};

export const isValidDiscordSnowflake = (roleId: string) => discordSnowflakePattern.test(roleId);
