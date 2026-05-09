const modulename = 'WebServer:AuthAddMasterSave';
import { CfxreSessAuthType, resolveEffectiveAuthedAdmin } from '@modules/WebServer/authLogic';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiAddMasterSaveResp } from '@shared/authApiTypes';
import { addMasterSaveBodySchema as bodySchema } from '@shared/authApiSchemas';
import consts from '@shared/consts';
const console = consoleFactory(modulename);

/**
 * Handles the Add Master flow
 */
export default async function AuthAddMasterSave(ctx: InitializedCtx) {
    const body = ctx.getBody(bodySchema);
    if (!body) return;
    const { password, discordId } = body;

    //Check if there are already admins set up
    if (txCore.adminStore.hasAdmins()) {
        return ctx.send<ApiAddMasterSaveResp>({
            error: `master_already_set`,
        });
    }

    //Checking the discordId
    if (typeof discordId === 'string' && !consts.validIdentifierParts.discord.test(discordId)) {
        return ctx.send<ApiAddMasterSaveResp>({
            error: `Invalid Discord ID.`,
        });
    }

    //Checking if session is still present
    const inboundSession = ctx.sessTools.get();
    if (!inboundSession || !inboundSession?.tmpAddMasterUserInfo) {
        return ctx.send<ApiAddMasterSaveResp>({
            error: `invalid_session`,
        });
    }
    const userInfo = inboundSession.tmpAddMasterUserInfo;

    //Create admins file and log in admin
    try {
        const vaultAdmin = txCore.adminStore.createAdminsFile(
            userInfo.name,
            userInfo.identifier,
            discordId,
            password,
            true,
        );

        //Setting session
        const sessData = {
            type: 'cfxre',
            username: userInfo.name,
            csrfToken: txCore.adminStore.genCsrfToken(),
            expiresAt: Date.now() + 86_400_000, //24h,
            identifier: userInfo.identifier,
        } satisfies CfxreSessAuthType;
        ctx.sessTools.set({ auth: sessData });

        const authedAdmin = await resolveEffectiveAuthedAdmin(vaultAdmin, sessData.csrfToken);
        authedAdmin.logAction(`created admins file`, 'auth.admins_file.create');
        return ctx.send<ApiAddMasterSaveResp>(authedAdmin.getAuthData());
    } catch (error) {
        ctx.sessTools.destroy();
        console.error(`Failed to create session: ${emsg(error)}`);
        return ctx.send<ApiAddMasterSaveResp>({
            error: `Failed to create session: ${emsg(error)}`,
        });
    }
}
