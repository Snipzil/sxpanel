const modulename = 'WebServer:AuthAddMasterCallback';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { ApiAddMasterCallbackResp } from '@shared/authApiTypes';
import { addMasterCallbackBodySchema as bodySchema } from '@shared/authApiSchemas';
import { getIdFromOauthNameid } from '@lib/player/idUtils';
import { handleOauthCallback } from './oauthMethods';
const console = consoleFactory(modulename);

/**
 * Handles the Add Master CitizenFX (Cfx.re) OAuth callback
 */
export default async function AuthAddMasterCallback(ctx: InitializedCtx) {
    const schemaRes = bodySchema.safeParse(ctx.request.body);
    if (!schemaRes.success) {
        return ctx.send<ApiAddMasterCallbackResp>({
            errorTitle: 'Invalid request body',
            errorMessage: schemaRes.error.message,
        });
    }
    const { redirectUri } = schemaRes.data;

    //Check if there are already admins set up
    if (txCore.adminStore.hasAdmins()) {
        return ctx.send<ApiAddMasterCallbackResp>({
            errorTitle: `Master account already set.`,
            errorMessage: `Please return to the login page.`,
        });
    }

    //Handling the callback
    const callbackResp = await handleOauthCallback(ctx, redirectUri);
    if ('errorCode' in callbackResp || 'errorTitle' in callbackResp) {
        return ctx.send<ApiAddMasterCallbackResp>(callbackResp);
    }
    const userInfo = callbackResp;

    //Getting identifier
    const fivemIdentifier = getIdFromOauthNameid(userInfo.nameid);
    if (!fivemIdentifier) {
        return ctx.send<ApiAddMasterCallbackResp>({
            errorTitle: 'Invalid nameid identifier.',
            errorMessage: `Could not extract the user identifier from the URL below. Please report this to the sxPanel dev team.\n${userInfo.nameid}`,
        });
    }

    //Setting session
    ctx.sessTools.set({
        tmpAddMasterUserInfo: {
            name: userInfo.name,
            identifier: fivemIdentifier,
        },
    });

    //Cache the profile picture, if any, for AuthedAdmin.profilePicture once the admin is created
    if (userInfo.picture) {
        txCore.cacheStore.set(`admin:picture:${userInfo.name}`, userInfo.picture);
    }

    return ctx.send<ApiAddMasterCallbackResp>({
        fivemName: userInfo.name,
        fivemId: fivemIdentifier,
        profilePicture: userInfo.picture,
    });
}
