const modulename = 'WebServer:AuthDiscordCallback';
import consoleFactory from '@lib/console';
import { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { DiscordSessAuthType, resolveEffectiveAuthedAdmin } from '@modules/WebServer/authLogic';
import { discordCallbackBodySchema as bodySchema } from '@shared/authApiSchemas';
import { ApiOauthCallbackErrorResp, ApiOauthCallbackResp, ReactAuthDataType } from '@shared/authApiTypes';
const console = consoleFactory(modulename);

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';

/**
 * Exchanges the Discord OAuth2 code for a token, fetches user info, and logs in the admin.
 */
export default async function AuthDiscordCallback(ctx: InitializedCtx) {
    const schemaRes = bodySchema.safeParse(ctx.request.body);
    if (!schemaRes.success) {
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Invalid request body',
            errorMessage: schemaRes.error.message,
        });
    }
    const { code, state } = schemaRes.data;

    //Check Discord OAuth config
    const clientId = txConfig.discordBot.oauthClientId;
    const clientSecret = txConfig.discordBot.oauthClientSecret;
    if (!clientId || !clientSecret) {
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Configuration error',
            errorMessage: 'Discord OAuth is not configured.',
        });
    }

    //Validate session state
    const inboundSession = ctx.sessTools.get();
    if (!inboundSession?.tmpDiscordOAuthState || !inboundSession?.tmpDiscordRedirectUri) {
        return ctx.send<ApiOauthCallbackErrorResp>({
            errorCode: 'invalid_session',
        });
    }
    if (state !== inboundSession.tmpDiscordOAuthState) {
        return ctx.send<ApiOauthCallbackErrorResp>({
            errorCode: 'invalid_state',
        });
    }

    //Redirect URI — read from session (bound at authorize time) rather than
    //re-deriving from request headers, which an attacker could manipulate
    //to differ from the authorize request.
    const redirectUri = inboundSession.tmpDiscordRedirectUri;

    //Exchange code for access token
    let accessToken: string;
    try {
        const tokenRes = await fetch(DISCORD_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }),
        });
        if (!tokenRes.ok) {
            const errBody = await tokenRes.text();
            console.verbose.warn(`Discord token exchange failed (${tokenRes.status}): ${errBody}`);
            return ctx.send<ApiOauthCallbackResp>({
                errorTitle: 'Discord token exchange failed',
                errorMessage: `Status ${tokenRes.status}`,
            });
        }
        const tokenData = (await tokenRes.json()) as { access_token?: unknown };
        if (!tokenData.access_token || typeof tokenData.access_token !== 'string') {
            const safeKeys = Object.keys(tokenData).join(', ');
            console.verbose.warn(`Discord token exchange returned invalid access_token. Response fields: ${safeKeys}`);
            return ctx.send<ApiOauthCallbackResp>({
                errorTitle: 'Discord token exchange failed',
                errorMessage: 'Invalid access_token in response',
            });
        }
        accessToken = tokenData.access_token;
    } catch (error) {
        console.verbose.error(`Discord token exchange error: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Discord token exchange error',
            errorMessage: emsg(error),
        });
    }

    //Fetch Discord user info
    let discordId: string;
    let discordUsername: string;
    try {
        const userRes = await fetch(DISCORD_USER_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!userRes.ok) {
            return ctx.send<ApiOauthCallbackResp>({
                errorTitle: 'Failed to fetch Discord user info',
                errorMessage: `Status ${userRes.status}`,
            });
        }
        const userData = (await userRes.json()) as { id: string; username: string; global_name?: string };
        discordId = userData.id;
        discordUsername = userData.global_name || userData.username;
    } catch (error) {
        console.verbose.error(`Discord user info error: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Failed to get Discord user info',
            errorMessage: emsg(error),
        });
    }

    //Match admin by Discord identifier
    const discordIdentifier = `discord:${discordId}`;
    try {
        const vaultAdmin = txCore.adminStore.getAdminByIdentifiers([discordIdentifier]);
        if (!vaultAdmin) {
            ctx.sessTools.destroy();
            return ctx.send<ApiOauthCallbackResp>({
                errorCode: 'not_admin',
                errorContext: {
                    identifier: discordIdentifier,
                    name: discordUsername,
                    profile: `https://discord.com/users/${discordId}`,
                },
            });
        }

        //Create session
        const sessData = {
            type: 'discord',
            username: vaultAdmin.name,
            csrfToken: txCore.adminStore.genCsrfToken(),
            expiresAt: Date.now() + 86_400_000, //24h
            identifier: discordIdentifier,
        } satisfies DiscordSessAuthType;
        ctx.sessTools.regenerate({ auth: sessData });

        const authedAdmin = await resolveEffectiveAuthedAdmin(vaultAdmin, sessData.csrfToken);
        txCore.logger.system.write(vaultAdmin.name, `logged in from ${ctx.ip} via discord`, 'login', {
            actionId: 'login.discord',
        });
        txManager.txRuntime.loginOrigins.count(ctx.txVars.hostType);
        txManager.txRuntime.loginMethods.count('discord');
        return ctx.send<ReactAuthDataType>(authedAdmin.getAuthData());
    } catch (error) {
        ctx.sessTools.destroy();
        console.verbose.error(`Failed to login: ${emsg(error)}`);
        return ctx.send<ApiOauthCallbackResp>({
            errorTitle: 'Failed to login',
            errorMessage: emsg(error),
        });
    }
}
