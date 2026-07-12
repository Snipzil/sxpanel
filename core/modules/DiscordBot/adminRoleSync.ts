import { resolveMappedRolePermissions } from './rolePermissions';
import { discordTagMappingsTouchRoles, refreshPlayerDiscordTags } from '@lib/player/playerTags';
import type { BridgeMessage } from './bridgeServer';

type AdminRoleSyncDependencies = {
    resolveMemberRoles: (uid: string) => Promise<{ isMember: boolean; memberRoles?: string[] }>;
};

export const handleAdminDiscordRoleChange = async (message: BridgeMessage, deps: AdminRoleSyncDependencies) => {
    const discordId = typeof message.uid === 'string' ? message.uid.trim() : '';
    if (!discordId.length) return false;

    const addedRoleIds = Array.isArray(message.addedRoleIds)
        ? message.addedRoleIds.filter((roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0)
        : [];
    const removedRoleIds = Array.isArray(message.removedRoleIds)
        ? message.removedRoleIds.filter((roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0)
        : [];
    const changedRoleIds = [...new Set([...addedRoleIds, ...removedRoleIds])];
    if (!changedRoleIds.length) return false;

    let handled = false;

    const touchesMappedRole = txConfig.discordBot.rolePermissions.some((mapping) => {
        return mapping.discordRoleIds.some((roleId) => changedRoleIds.includes(roleId));
    });
    const linkedAdmin = txCore.adminStore.getAdminByProviderUID(discordId);
    if (touchesMappedRole && linkedAdmin?.providers.discord) {
        const roleLookup = await deps.resolveMemberRoles(discordId).catch(() => ({
            isMember: false,
            memberRoles: [],
        }));
        const memberRoles =
            roleLookup.isMember === true && Array.isArray(roleLookup.memberRoles) ? roleLookup.memberRoles : [];
        const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);

        await txCore.adminStore.syncAdminDiscordRolePermissions(
            discordId,
            mappedRolePermissions
                ? {
                      permissions: mappedRolePermissions.permissions,
                      presetIds: mappedRolePermissions.presetIds,
                      roleIds: memberRoles,
                  }
                : false,
        );
        handled = true;
    }

    if (discordTagMappingsTouchRoles(changedRoleIds)) {
        for (const player of txCore.fxPlayerlist.getConnectedPlayersByDiscordId(discordId)) {
            if (!player.isRegistered) continue;
            const changed = await refreshPlayerDiscordTags(player);
            if (changed) {
                txCore.fxPlayerlist.syncPlayerTags(player.netid);
            }
        }
        handled = true;
    }

    return handled;
};
