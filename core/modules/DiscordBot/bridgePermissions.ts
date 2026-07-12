import { resolveEffectiveAdminPermissions, resolveMappedRolePermissions } from './rolePermissions';
import { buildDeniedReply, translateBot } from './bridgeReplyHelpers';
import type { BridgeMessage } from './bridgeServer';

export const resolveAdminUser = (requesterId: unknown) => {
    if (typeof requesterId !== 'string' || !requesterId.length) {
        return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
    }

    const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
    if (!admin) {
        return buildDeniedReply(
            'warning',
            translateBot('common.no_sxpanel_access', { requesterId }),
            'unlinked_account',
        );
    }

    return { admin };
};

export const resolveMappedRolePermission = (requesterId: unknown, memberRoles: unknown, reqPerm: string) => {
    const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);
    if (!mappedRolePermissions) {
        if (typeof requesterId !== 'string' || !requesterId.length) {
            return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
        }

        return buildDeniedReply(
            'warning',
            translateBot('moderation.access.no_access', { requesterId }),
            'unlinked_account',
        );
    }

    if (
        !mappedRolePermissions.permissions.includes('all_permissions') &&
        !mappedRolePermissions.permissions.includes(reqPerm)
    ) {
        const permissionLabel = txCore.adminStore.registeredPermissions[reqPerm] ?? reqPerm;
        return buildDeniedReply(
            'danger',
            translateBot('moderation.access.discord_role_missing_permission', { permissionLabel }),
            'missing_permissions',
        );
    }

    return {
        source: 'role' as const,
        resolvedName: mappedRolePermissions.labels.join(', '),
        actorName: `[Discord] ${mappedRolePermissions.labels.join(', ')}`,
    };
};

export const resolveAdminPermission = (requesterId: unknown, memberRoles: unknown, reqPerm: string) => {
    if (typeof requesterId !== 'string' || !requesterId.length) {
        return buildDeniedReply('danger', translateBot('common.could_not_resolve_user'), 'invalid_request');
    }

    const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
    if (admin) {
        const { mappedRolePermissions, permissions: effectivePermissions } = resolveEffectiveAdminPermissions(
            admin,
            memberRoles,
        );
        if (
            admin.isMaster !== true &&
            !effectivePermissions.includes('all_permissions') &&
            !effectivePermissions.includes(reqPerm)
        ) {
            const permissionLabel = txCore.adminStore.registeredPermissions[reqPerm] ?? reqPerm;
            return buildDeniedReply(
                'danger',
                translateBot(
                    mappedRolePermissions
                        ? 'moderation.access.missing_permission_mapped'
                        : 'moderation.access.missing_permission',
                    { permissionLabel },
                ),
                'missing_permissions',
            );
        }

        return {
            admin,
            source: 'admin' as const,
            resolvedName: admin.name,
            actorName: admin.name,
        };
    }

    return resolveMappedRolePermission(requesterId, memberRoles, reqPerm);
};

export const buildAddonRequestHeaders = (headers: unknown, requesterId: unknown, requesterName: unknown) => {
    const sanitizedHeaders =
        headers && typeof headers === 'object'
            ? Object.fromEntries(
                  Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
              )
            : {};

    if (typeof requesterId === 'string' && requesterId.length) {
        sanitizedHeaders['x-sxpanel-discord-user-id'] = requesterId;
        sanitizedHeaders['x-fxpanel-discord-user-id'] = requesterId;
    }
    if (typeof requesterName === 'string' && requesterName.length) {
        sanitizedHeaders['x-sxpanel-discord-user-name'] = requesterName;
        sanitizedHeaders['x-fxpanel-discord-user-name'] = requesterName;
    }

    return sanitizedHeaders;
};

export const resolveAddonAdminContext = (requesterId: unknown, requesterName: unknown, memberRoles: unknown) => {
    if (typeof requesterId === 'string' && requesterId.length) {
        const admin = txCore.adminStore.getAdminByProviderUID(requesterId);
        if (admin) {
            const effectivePermissions = resolveEffectiveAdminPermissions(admin, memberRoles).permissions;
            return {
                name: admin.name,
                permissions: effectivePermissions,
                isMaster: admin.isMaster === true,
            };
        }
    }

    const mappedRolePermissions = resolveMappedRolePermissions(memberRoles);
    if (mappedRolePermissions) {
        return {
            name: `[Discord] ${mappedRolePermissions.labels.join(', ')}`,
            permissions: mappedRolePermissions.permissions,
            isMaster: false,
        };
    }

    const fallbackName =
        typeof requesterName === 'string' && requesterName.trim().length
            ? requesterName.trim()
            : typeof requesterId === 'string' && requesterId.length
              ? requesterId
              : 'Unknown';

    return {
        name: `[Discord] ${fallbackName}`,
        permissions: [],
        isMaster: false,
    };
};

export const handleAddonRouteRequest = async (message: BridgeMessage) => {
    const addonId = typeof message.addonId === 'string' ? message.addonId.trim() : '';
    if (!addonId) throw new Error('Addon ID is required.');

    const routePath = typeof message.path === 'string' ? message.path.trim() : '';
    if (!routePath.startsWith('/')) {
        throw new Error('Addon route path must start with "/".');
    }

    const addon = txCore.addonManager?.getAddon(addonId);
    if (!addon || addon.state !== 'running') {
        throw new Error(`Addon ${addonId} is not running.`);
    }
    if (!addon.process) {
        throw new Error(`Addon ${addonId} does not expose a server entry.`);
    }

    const method =
        typeof message.method === 'string' && message.method.trim().length ? message.method.toUpperCase() : 'POST';

    return await addon.process.handleHttpRequest({
        method,
        path: routePath,
        headers: buildAddonRequestHeaders(message.headers, message.requesterId, message.requesterName),
        body: message.body ?? null,
        admin: resolveAddonAdminContext(message.requesterId, message.requesterName, message.memberRoles),
    });
};
