import { getDiscordRoleSyncData, type StoredAdmin } from '@modules/AdminStore/adminClasses';
import { getAllPermissionPresets, resolvePermissionPresetIdsFromCatalog } from '@modules/AdminStore/permissionPresets';

export const mergePermissions = (...permissionSets: string[][]) => {
    const mergedPermissions = new Set<string>();

    for (const permissionSet of permissionSets) {
        for (const permission of permissionSet) {
            mergedPermissions.add(permission);
        }
    }

    return [...mergedPermissions];
};

export const resolveMappedRolePermissions = (memberRoles: unknown) => {
    if (!Array.isArray(memberRoles)) return false;

    const roleIds = new Set(memberRoles.filter((roleId): roleId is string => typeof roleId === 'string'));
    if (roleIds.size === 0) return false;

    const matchedLabels = new Set<string>();
    const matchedPresetIds = new Set<string>();

    for (const mapping of txConfig.discordBot.rolePermissions) {
        const matchesRole = mapping.discordRoleIds.some((roleId) => roleIds.has(roleId));
        if (!matchesRole) continue;

        if (typeof mapping.label === 'string' && mapping.label.length) {
            matchedLabels.add(mapping.label);
        }
        if (typeof mapping.permissionPresetId === 'string' && mapping.permissionPresetId.length) {
            matchedPresetIds.add(mapping.permissionPresetId);
        }
    }

    if (!matchedPresetIds.size) return false;

    const resolvedPresets = resolvePermissionPresetIdsFromCatalog(getAllPermissionPresets(), [...matchedPresetIds]);
    if (!resolvedPresets.permissions.length) return false;

    const resolvedLabels = matchedLabels.size ? [...matchedLabels] : resolvedPresets.presetNames;
    if (!resolvedLabels.length) return false;

    return {
        labels: resolvedLabels,
        presetIds: [...matchedPresetIds],
        presetNames: resolvedPresets.presetNames,
        permissions: resolvedPresets.permissions,
    };
};

export const resolveStoredDiscordRolePermissions = (admin: Pick<StoredAdmin, 'providers'>) => {
    const syncData = getDiscordRoleSyncData(admin.providers);
    if (!syncData) return false;

    return {
        presetIds: syncData.presetIds ?? [],
        roleIds: syncData.roleIds ?? [],
        permissions: syncData.permissions,
    };
};

export const resolveEffectiveAdminPermissions = (admin: StoredAdmin, memberRoles: unknown) => {
    const storedRolePermissions = resolveStoredDiscordRolePermissions(admin);

    if (!Array.isArray(memberRoles)) {
        return {
            mappedRolePermissions: false,
            storedRolePermissions,
            permissions: storedRolePermissions
                ? mergePermissions(admin.permissions, storedRolePermissions.permissions)
                : admin.permissions,
        } as const;
    }

    const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);
    if (!mappedRolePermissions) {
        return {
            mappedRolePermissions: false,
            storedRolePermissions,
            permissions: admin.permissions,
        } as const;
    }

    return {
        mappedRolePermissions,
        storedRolePermissions,
        permissions: mergePermissions(admin.permissions, mappedRolePermissions.permissions),
    } as const;
};