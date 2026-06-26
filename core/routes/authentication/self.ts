const modulename = 'WebServer:AuthSelf';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { adminMatchesPresetRow } from '@lib/presetRowMaterial';
import { refreshSlotPresetAces } from '@lib/presetSlotDirective';
import { getAdminAccessBlockReason } from '@modules/WebServer/adminAccessPolicy';
import { ReactAuthDataType } from '@shared/authApiTypes';
import type { ApiAuthErrorResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

/**
 * Method to check for the authentication, returning the admin object if it's valid.
 * This is used in the NUI auth and in the sv_admins.lua, as well as in the react web ui.
 */
export default async function AuthSelf(ctx: AuthedCtx) {
    const isNuiAuth = typeof ctx.headers?.['x-txadmin-token'] === 'string';
    if (isNuiAuth) {
        const blockReason = getAdminAccessBlockReason(ctx.admin);
        if (blockReason) {
            return ctx.send<ApiAuthErrorResp>({
                logout: true,
                reason: blockReason,
            });
        }
    }

    if (isNuiAuth && adminMatchesPresetRow(ctx.admin)) {
        const identifiersHeader = ctx.headers?.['x-txadmin-identifiers'];
        if (typeof identifiersHeader === 'string' && identifiersHeader.length) {
            const identifiers = identifiersHeader.split(',').filter((entry) => entry.length);
            refreshSlotPresetAces(identifiers);
        }
    }

    ctx.send<ReactAuthDataType>(ctx.admin.getAuthData());
}
