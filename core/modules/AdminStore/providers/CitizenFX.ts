const modulename = 'AdminStore:CitizenFXProvider';
import consoleFactory from '@lib/console';
import { z } from 'zod';
const console = consoleFactory(modulename);

const IDMS_BASE_URL = 'https://idms.fivem.net';
//NOTE: this is the same public client used by upstream txAdmin - the Cfx.re
//identity provider treats it as a public/native client, there is no secret to protect.
const CLIENT_ID = 'txadmin_test';
const CLIENT_SECRET = 'txadmin_test';
const REQUEST_TIMEOUT_MS = 10_000;

const userInfoSchema = z.object({
    name: z.string().min(1),
    profile: z.string().min(1),
    nameid: z.string().min(1),
});
export type CitizenFXUserInfoType = z.infer<typeof userInfoSchema> & {
    picture: string | undefined;
};

/**
 * Builds the CitizenFX (Cfx.re / FiveM account) OIDC authorization URL.
 */
export const getCitizenFXAuthUrl = (redirectUri: string, state: string) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: 'openid identify',
        state,
    });
    return `${IDMS_BASE_URL}/connect/authorize?${params.toString()}`;
};

/**
 * Exchanges the authorization code for an access token, then fetches the user info.
 */
export const getCitizenFXUserInfo = async (code: string, redirectUri: string): Promise<CitizenFXUserInfoType> => {
    const tokenRes = await fetch(`${IDMS_BASE_URL}/connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!tokenRes.ok) {
        throw new Error(`Token exchange failed (status ${tokenRes.status})`);
    }
    const tokenData = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof tokenData.access_token !== 'string') {
        throw new Error('Invalid access_token in token exchange response');
    }

    const userRes = await fetch(`${IDMS_BASE_URL}/connect/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!userRes.ok) {
        throw new Error(`Failed to fetch user info (status ${userRes.status})`);
    }
    const userData = (await userRes.json()) as { picture?: unknown };
    const parsed = userInfoSchema.parse(userData);
    const picture =
        typeof userData.picture === 'string' && userData.picture.startsWith('https://') ? userData.picture : undefined;

    return { ...parsed, picture };
};
