const modulename = 'WebServer:AuthLogic';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import consoleFactory from '@lib/console';
import type { SessToolsType } from '@modules/WebServer/middlewares/sessionMws';
import { StoredAdmin, AuthedAdmin } from '@modules/AdminStore/adminClasses';
import { resolveEffectiveAdminPermissions } from '@modules/DiscordBot/rolePermissions';
export { AuthedAdmin, StoredAdmin };
export type { AuthedAdminType } from '@modules/AdminStore/adminClasses';
const console = consoleFactory(modulename);

/**
 * Return type helper - null reason indicates nothing to print
 */
export type AuthLogicReturnType =
    | {
          success: true;
          admin: AuthedAdmin;
      }
    | {
          success: false;
          rejectReason?: string;
      };
const successResp = (storedAdmin: StoredAdmin, csrfToken?: string) =>
    ({
        success: true,
        admin: storedAdmin.getAuthed(csrfToken),
    }) as const;
const failResp = (reason?: string) =>
    ({
        success: false,
        rejectReason: reason,
    }) as const;

const haveSamePermissions = (left: string[], right: string[]) => {
    if (left.length !== right.length) return false;

    const rightSet = new Set(right);
    for (const permission of left) {
        if (!rightSet.has(permission)) return false;
    }

    return true;
};

const applyPermissionOverrides = (admin: AuthedAdmin, permissions: string[]) => {
    if (haveSamePermissions(admin.permissions, permissions)) {
        return admin;
    }

    return admin.getAuthed(admin.csrfToken, {
        isMaster: admin.isMaster,
        permissions,
    });
};

export const resolveEffectiveAuthedAdmin = async (admin: StoredAdmin | AuthedAdmin, csrfToken?: string) => {
    const baseAuthedAdmin = admin instanceof AuthedAdmin ? admin : admin.getAuthed(csrfToken);
    const storedEffectiveAdmin = applyPermissionOverrides(
        baseAuthedAdmin,
        resolveEffectiveAdminPermissions(baseAuthedAdmin, undefined).permissions,
    );

    const discordId = storedEffectiveAdmin.providers.discord?.id;
    if (!discordId || txConfig.discordBot.rolePermissions.length === 0) {
        return storedEffectiveAdmin;
    }

    if (txCore.discordBot?.isClientReady !== true) {
        return storedEffectiveAdmin;
    }

    try {
        const { memberRoles } = await txCore.discordBot.resolveMemberRoles(discordId);
        const { mappedRolePermissions, permissions } = resolveEffectiveAdminPermissions(baseAuthedAdmin, memberRoles);

        if (typeof txCore.adminStore.syncAdminDiscordRolePermissions === 'function') {
            txCore.adminStore
                .syncAdminDiscordRolePermissions(
                    discordId,
                    mappedRolePermissions
                        ? {
                              permissions: mappedRolePermissions.permissions,
                              presetIds: mappedRolePermissions.presetIds,
                              roleIds: Array.isArray(memberRoles)
                                  ? memberRoles.filter(
                                        (roleId): roleId is string => typeof roleId === 'string' && roleId.length > 0,
                                    )
                                  : [],
                          }
                        : false,
                )
                .catch((error: unknown) => {
                    console.verbose.debug(
                        `Failed to persist Discord-linked permissions for '${storedEffectiveAdmin.name}': ${emsg(error)}`,
                    );
                });
        }

        return applyPermissionOverrides(storedEffectiveAdmin, permissions);
    } catch (error) {
        console.verbose.debug(
            `Failed to resolve Discord-linked permissions for '${storedEffectiveAdmin.name}': ${emsg(error)}`,
        );
        return storedEffectiveAdmin;
    }
};

/**
 * ZOD schemas for session auth
 */
const validPassSessAuthSchema = z.object({
    type: z.literal('password'),
    username: z.string(),
    csrfToken: z.string(),
    expiresAt: z.literal(false),
    password_revision: z.number().int().nonnegative(),
});
export type PassSessAuthType = z.infer<typeof validPassSessAuthSchema>;

/** @deprecated Pre-v0.3.1 sessions; still accepted until the cookie is rotated. */
const validPassSessLegacySchema = z.object({
    type: z.literal('password'),
    username: z.string(),
    csrfToken: z.string(),
    expiresAt: z.literal(false),
    password_hash: z.string(),
});

const validCfxreSessAuthSchema = z.object({
    type: z.literal('cfxre'),
    username: z.string(),
    csrfToken: z.string(),
    expiresAt: z.number(),
    identifier: z.string(),
});
export type CfxreSessAuthType = z.infer<typeof validCfxreSessAuthSchema>;

const validDiscordSessAuthSchema = z.object({
    type: z.literal('discord'),
    username: z.string(),
    csrfToken: z.string(),
    expiresAt: z.number(),
    identifier: z.string(),
});
export type DiscordSessAuthType = z.infer<typeof validDiscordSessAuthSchema>;

// 2FA pending session — password verified, awaiting TOTP code
const validPending2faSessSchema = z.object({
    type: z.literal('pending_2fa'),
    username: z.string(),
    password_revision: z.number().int().nonnegative(),
});
export type Pending2faSessAuthType = z.infer<typeof validPending2faSessSchema>;

const validSessAuthSchema = z.union([
    validPassSessAuthSchema,
    validPassSessLegacySchema,
    validCfxreSessAuthSchema,
    validDiscordSessAuthSchema,
]);

/**
 * Autentication logic used in both websocket and webserver, for both web and nui requests.
 */
export const checkRequestAuth = (
    reqHeader: { [key: string]: unknown },
    reqIp: string,
    isLocalRequest: boolean,
    sessTools: SessToolsType,
): AuthLogicReturnType => {
    return typeof reqHeader['x-txadmin-token'] === 'string'
        ? nuiAuthLogic(reqIp, isLocalRequest, reqHeader)
        : normalAuthLogic(sessTools);
};

/**
 * Autentication logic used in both websocket and webserver
 */
export const normalAuthLogic = (sessTools: SessToolsType): AuthLogicReturnType => {
    try {
        // Getting session
        const sess = sessTools.get();
        if (!sess) {
            return failResp();
        }

        // Parsing session auth
        const validationResult = validSessAuthSchema.safeParse(sess?.auth);
        if (!validationResult.success) {
            return failResp();
        }
        const sessAuth = validationResult.data;

        // Checking for expiration
        if (sessAuth.expiresAt !== false && Date.now() > sessAuth.expiresAt) {
            return failResp(`Expired session from '${sess.auth?.username}'.`);
        }

        // Searching for admin in AdminStore
        const storedAdmin = txCore.adminStore.getAdminByName(sessAuth.username);
        if (!storedAdmin) {
            return failResp(`Admin '${sessAuth.username}' not found.`);
        }

        // Checking for auth types
        if (sessAuth.type === 'password') {
            if ('password_revision' in sessAuth) {
                if (storedAdmin.passwordRevision !== sessAuth.password_revision) {
                    return failResp(`Password revision doesn't match for '${sessAuth.username}'.`);
                }
            } else if (storedAdmin.passwordHash !== sessAuth.password_hash) {
                return failResp(`Password hash doesn't match for '${sessAuth.username}'.`);
            }
            return successResp(storedAdmin, sessAuth.csrfToken);
        } else if (sessAuth.type === 'cfxre') {
            if (
                typeof storedAdmin.providers.citizenfx !== 'object' ||
                storedAdmin.providers.citizenfx.identifier !== sessAuth.identifier
            ) {
                return failResp(`Cfxre identifier doesn't match for '${sessAuth.username}'.`);
            }
            return successResp(storedAdmin, sessAuth.csrfToken);
        } else if (sessAuth.type === 'discord') {
            if (
                typeof storedAdmin.providers.discord !== 'object' ||
                storedAdmin.providers.discord.identifier !== sessAuth.identifier
            ) {
                return failResp(`Discord identifier doesn't match for '${sessAuth.username}'.`);
            }
            return successResp(storedAdmin, sessAuth.csrfToken);
        } else {
            return failResp('Invalid auth type.');
        }
    } catch (error) {
        console.debug(`Error validating session data: ${emsg(error)}`);
        return failResp('Error validating session data.');
    }
};

/**
 * Autentication & authorization logic used in for nui requests
 */
export const nuiAuthLogic = (
    reqIp: string,
    isLocalRequest: boolean,
    reqHeader: { [key: string]: unknown },
): AuthLogicReturnType => {
    try {
        // Check sus IPs
        if (!isLocalRequest && !txConfig.webServer.disableNuiSourceCheck) {
            console.verbose.warn(`NUI Auth Failed: reqIp "${reqIp}" not a local or allowed address.`);
            return failResp('Invalid Request: source');
        }

        // Check missing headers
        if (typeof reqHeader['x-txadmin-token'] !== 'string') {
            return failResp('Invalid Request: token header');
        }
        if (typeof reqHeader['x-txadmin-identifiers'] !== 'string') {
            return failResp('Invalid Request: identifiers header');
        }

        // Check token value (timing-safe, consistent with intercom / host token checks)
        const tokenHeader = reqHeader['x-txadmin-token'];
        const expectedTok = txCore.webServer.luaComToken;
        if (
            typeof tokenHeader !== 'string' ||
            typeof expectedTok !== 'string' ||
            !expectedTok.length ||
            tokenHeader.length !== expectedTok.length ||
            !timingSafeEqual(Buffer.from(tokenHeader), Buffer.from(expectedTok))
        ) {
            const censoredExpected =
                typeof expectedTok === 'string' && expectedTok.length
                    ? `${expectedTok.slice(0, 6)}...${expectedTok.slice(-6)}`
                    : '(unset)';
            console.verbose.warn(`NUI Auth Failed: token mismatch (expected '${censoredExpected}').`);
            return failResp('Unauthorized: token value');
        }

        // Check identifier array
        const identifiers = reqHeader['x-txadmin-identifiers'].split(',').filter((i) => i.length);
        if (!identifiers.length) {
            return failResp('Unauthorized: empty identifier array');
        }

        // Searching for admin in AdminStore
        const storedAdmin = txCore.adminStore.getAdminByIdentifiers(identifiers);
        if (!storedAdmin) {
            if (!reqHeader['x-txadmin-identifiers'].includes('license:')) {
                return failResp(
                    'Unauthorized: you do not have a license identifier, which means the server probably has sv_lan enabled. Please disable sv_lan and restart the server to use the in-game menu.',
                );
            } else {
                //this one is handled differently in resource/menu/client/cl_base.lua
                return failResp('nui_admin_not_found');
            }
        }
        return successResp(storedAdmin, undefined);
    } catch (error) {
        console.debug(`Error validating session data: ${emsg(error)}`);
        return failResp('Error validating auth header');
    }
};
