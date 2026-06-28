const modulename = 'AdminStore:DiscourseProvider';
import crypto from 'node:crypto';
import got from '@lib/got';
import consoleFactory from '@lib/console';
import { z } from 'zod';
const console = consoleFactory(modulename);

const DISCOURSE_BASE_URL = 'https://forum.cfx.re';
const APPLICATION_NAME = 'sxPanel';
const CLIENT_ID = 'sxpanel_discourse_auth';

const discourseUserSchema = z.object({
    current_user: z.object({
        id: z.number().int().positive(),
        username: z.string().min(1),
    }),
});
export type DiscourseUserInfoType = {
    id: number;
    username: string;
    identifier: string;
};

/**
 * Generates an RSA-2048 keypair for the Discourse User API Key flow.
 * Returns PEM strings for both keys.
 */
export const generateKeyPair = () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    return { publicKey, privateKey };
};

/**
 * Builds the Discourse User API Key authorization URL.
 */
export const getDiscourseAuthUrl = (publicKey: string, nonce: string, authRedirect: string) => {
    const params = new URLSearchParams({
        application_name: APPLICATION_NAME,
        client_id: CLIENT_ID,
        nonce,
        scopes: 'session_info',
        public_key: publicKey,
        auth_redirect: authRedirect,
        padding: 'oaep',
    });
    return `${DISCOURSE_BASE_URL}/user-api-key/new?${params.toString()}`;
};

/**
 * Decrypts the encrypted payload returned by Discourse after user authorization.
 * Returns the decrypted JSON containing the API key and nonce.
 */
export const decryptPayload = (encryptedPayload: string, privateKeyPem: string) => {
    const buffer = Buffer.from(encryptedPayload, 'base64');
    const decrypted = crypto.privateDecrypt(
        {
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        buffer,
    );
    return JSON.parse(decrypted.toString('utf-8')) as {
        key: string;
        nonce: string;
        push: boolean;
        api: number;
    };
};

/**
 * Fetches the current user info from Discourse using a User API Key.
 * Returns the user's Discourse ID and username.
 */
export const getDiscourseUserInfo = async (apiKey: string): Promise<DiscourseUserInfoType> => {
    const resp = await got(`${DISCOURSE_BASE_URL}/session/current.json`, {
        headers: {
            'User-Api-Key': apiKey,
        },
        timeout: { request: 10000 },
    }).json();
    const parsed = discourseUserSchema.parse(resp);

    //Revoke the API key immediately — we only needed it for this one call
    revokeApiKey(apiKey);

    return {
        id: parsed.current_user.id,
        username: parsed.current_user.username,
        identifier: `fivem:${parsed.current_user.id}`,
    };
};

/**
 * Revokes a Discourse User API Key. Fire-and-forget.
 */
const revokeApiKey = (apiKey: string) => {
    got.post(`${DISCOURSE_BASE_URL}/user-api-key/revoke`, {
        headers: {
            'User-Api-Key': apiKey,
        },
        timeout: { request: 10000 },
    }).catch((error) => {
        console.warn(`Failed to revoke Discourse API key: ${error.message}`);
    });
};
