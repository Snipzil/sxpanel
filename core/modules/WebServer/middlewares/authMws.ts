const modulename = 'WebServer:AuthMws';
import { timingSafeEqual } from 'node:crypto';
import consoleFactory from '@lib/console';
import { checkRequestAuth, normalAuthLogic, nuiAuthLogic, resolveEffectiveAuthedAdmin } from '../authLogic';
import { getAdminAccessDenial } from '../adminAccessPolicy';
import { ApiAccessDeniedResp, ApiAuthErrorResp, ApiToastResp, GenericApiErrorResp } from '@shared/genericApiTypes';
import { InitializedCtx } from '../ctxTypes';
import { txHostConfig } from '@core/globalData';
import { isIpAddressLocal, isIpAddressLoopback } from '@lib/host/isIpAddressLocal';
const console = consoleFactory(modulename);

const getCspNonce = (state: { [key: string]: unknown }): string | undefined =>
    typeof state.cspNonce === 'string' ? state.cspNonce : undefined;

const webLogoutPage = (nonce?: string) => {
    const nonceAttr = nonce ? ` nonce="${nonce}"` : '';
    return `<style${nonceAttr}>
body {
    margin: 0;
}
.notice {
    font-family: sans-serif;
    font-size: 1.5em;
    text-align: center;
    background-color: #222326;
    color: #F7F7F8;
    padding: 2em;
    border: 1px solid #333539;
    border-radius: 0.5em;
}
.notice a {
    color: #F00A53;
}
</style>
    <p class="notice">
        User logged out. <br>
        Redirecting to <a href="/login#expired" target="_parent">login page</a>...
    </p>
<script${nonceAttr}>
    // Notify parent window that auth failed; restrict to same origin to avoid cross-origin leaks
    window.parent.postMessage({ type: 'logoutNotice' }, window.location.origin);
    // If parent redirect didn't work, redirect here
    setTimeout(function() {
        window.parent.location.href = '/login#expired';
    }, 2000);
</script>`;
};

/**
 * For the hosting provider routes
 */
export const hostAuthMw = async (ctx: InitializedCtx, next: Function) => {
    const docs = 'https://aka.cfx.re/txadmin-env-config';

    // Token disabled is intended for same-machine development only.
    if (txHostConfig.hostApiToken === 'disabled') {
        if (!isIpAddressLoopback(ctx.ip)) {
            console.warn(`Host API request blocked (token disabled, non-loopback IP): ${ctx.ip}`);
            return ctx.send({
                error: 'forbidden',
                desc: 'Host status API is restricted to loopback requests when TXHOST_API_TOKEN is disabled.',
                docs,
            });
        }
        return await next();
    }

    //Token undefined
    if (!txHostConfig.hostApiToken) {
        return ctx.send({
            error: 'token not configured',
            desc: 'need to configure the TXHOST_API_TOKEN environment variable to be able to use the status endpoint',
            docs,
        });
    }

    const headerToken = ctx.headers['x-txadmin-envtoken'];
    const paramsToken = ctx.query.envtoken;
    if (paramsToken) {
        return ctx.send({
            error: 'query token unsupported',
            desc: 'provide the token in the x-txadmin-envtoken header instead of the query string',
            docs,
        });
    }
    if (typeof headerToken !== 'string' || !headerToken) {
        return ctx.send({
            error: 'token missing',
            desc: 'a token needs to be provided in the x-txadmin-envtoken header',
            docs,
        });
    }
    if (
        typeof txHostConfig.hostApiToken !== 'string' ||
        headerToken.length !== txHostConfig.hostApiToken.length ||
        !timingSafeEqual(Buffer.from(headerToken), Buffer.from(txHostConfig.hostApiToken))
    ) {
        return ctx.send({
            error: 'invalid token',
            desc: 'the token provided does not match the TXHOST_API_TOKEN environment variable',
            docs,
        });
    }

    return await next();
};

/**
 * Intercom auth middleware
 * This does not set ctx.admin and does not use session/cookies whatsoever.
 * Validates both the token and that the request originates from a local/allowed IP.
 */
export const intercomAuthMw = async (ctx: InitializedCtx, next: Function) => {
    if (!isIpAddressLocal(ctx.ip)) {
        console.warn(`Intercom request from non-local IP blocked: ${ctx.ip}`);
        return ctx.send({ error: 'invalid request origin' });
    }
    const txAdminToken = ctx.request.body?.txAdminToken;
    if (
        typeof txAdminToken !== 'string' ||
        typeof txCore.webServer.luaComToken !== 'string' ||
        !txCore.webServer.luaComToken ||
        txAdminToken.length !== txCore.webServer.luaComToken.length ||
        !timingSafeEqual(Buffer.from(txAdminToken), Buffer.from(txCore.webServer.luaComToken))
    ) {
        console.warn(`Intercom request with invalid token from: ${ctx.ip}`);
        return ctx.send({ error: 'invalid token' });
    }

    console.verbose.debug(`Intercom auth OK from ${ctx.ip} — ${ctx.path}`);
    await next();
};

/**
 * Used for the legacy web interface.
 */
export const webAuthMw = async (ctx: InitializedCtx, next: Function) => {
    //Check auth
    const authResult = checkRequestAuth(ctx.request.headers, ctx.ip, ctx.txVars.isLocalRequest, ctx.sessTools);
    if (!authResult.success) {
        ctx.sessTools.destroy();
        if (authResult.rejectReason) {
            console.verbose.warn(`Invalid session auth: ${authResult.rejectReason}`);
        }
        return ctx.send(webLogoutPage(getCspNonce(ctx.state)));
    }

    //Adding the admin to the context
    const admin = await resolveEffectiveAuthedAdmin(authResult.admin);
    ctx.admin = admin;
    await next();
};

/**
 * API Authentication Middleware
 */
export const apiAuthMw = async (ctx: InitializedCtx, next: Function) => {
    const sendTypedResp = (data: ApiAuthErrorResp | ApiAccessDeniedResp | (ApiToastResp & GenericApiErrorResp)) =>
        ctx.send(data);

    //Check auth
    const authResult = checkRequestAuth(ctx.request.headers, ctx.ip, ctx.txVars.isLocalRequest, ctx.sessTools);
    if (!authResult.success) {
        ctx.sessTools.destroy();
        if (authResult.rejectReason && (authResult.rejectReason !== 'nui_admin_not_found' || console.isVerbose)) {
            console.verbose.warn(`Invalid session auth: ${authResult.rejectReason}`);
        }
        return sendTypedResp({
            logout: true,
            reason: authResult.rejectReason ?? 'no session',
        });
    }

    //For web routes, we need to check the CSRF token
    //For nui routes, we need to check the luaComToken, which is already done in nuiAuthLogic above
    if (ctx.txVars.isWebInterface) {
        const sessToken = authResult.admin?.csrfToken; //it should exist for nui because of authLogic
        const headerToken = ctx.headers['x-txadmin-csrftoken'];
        const body = ctx.request.body;
        const bodyRecord = body && typeof body === 'object' ? (body as Record<string, unknown>) : undefined;
        const bodyToken = bodyRecord && typeof bodyRecord.csrfToken === 'string' ? bodyRecord.csrfToken : undefined;
        const providedToken = typeof headerToken === 'string' && headerToken ? headerToken : bodyToken;
        if (!sessToken || !providedToken || sessToken !== providedToken) {
            console.verbose.warn(`Invalid CSRF token: ${ctx.path}`);
            const msg = providedToken
                ? 'Error: Invalid CSRF token, please refresh the page or try to login again.'
                : 'Error: Missing CSRF token. This likely means your files are not updated or you are using some reverse proxy that is removing the CSRF token from the HTTP request.';

            //Doing ApiAuthErrorResp & GenericApiErrorResp to maintain compatibility with all routes
            //"error" is used by diagnostic, masterActions, playerlist, whitelist and possibly more
            return sendTypedResp({
                type: 'error',
                msg: msg,
                error: msg,
            });
        }
    }

    //Adding the admin to the context
    const admin = await resolveEffectiveAuthedAdmin(authResult.admin);
    ctx.admin = admin;

    const accessDenial = getAdminAccessDenial(admin, ctx.path);
    if (accessDenial) {
        ctx.status = 403;
        return sendTypedResp({
            accessDenied: true,
            reason: accessDenial.reason,
            error: accessDenial.message,
        });
    }

    await next();
};

/**
 * Asset Authentication Middleware
 *
 * Used by executable/static asset routes that must be accessible from either:
 * - Web panel requests authenticated via session cookie, or
 * - In-game NUI requests authenticated via x-txadmin-token headers.
 *
 * Intentionally skips CSRF checks because static/script/style requests and
 * token-authenticated NUI fetches do not carry the web CSRF header.
 */
export const assetAuthMw = async (ctx: InitializedCtx, next: Function) => {
    // Prefer regular web session auth for panel/browser asset requests.
    const webAuthResult = normalAuthLogic(ctx.sessTools);
    if (webAuthResult.success) {
        const admin = await resolveEffectiveAuthedAdmin(webAuthResult.admin);
        ctx.admin = admin;
        const accessDenial = getAdminAccessDenial(admin, ctx.path);
        if (accessDenial) {
            ctx.status = 403;
            return ctx.send(webLogoutPage(getCspNonce(ctx.state)));
        }
        await next();
        return;
    }
    if ('rejectReason' in webAuthResult && webAuthResult.rejectReason) {
        console.verbose.warn(`[assetAuth] Session auth failed: ${webAuthResult.rejectReason}`);
    }

    // Fallback to token-based NUI auth for in-game requests.
    const tokenHeader = ctx.request.headers['x-txadmin-token'];
    if (typeof tokenHeader === 'string' && tokenHeader.length > 0) {
        const nuiAuthResult = nuiAuthLogic(ctx.ip, ctx.txVars.isLocalRequest, ctx.request.headers);
        if (nuiAuthResult.success) {
            const admin = await resolveEffectiveAuthedAdmin(nuiAuthResult.admin);
            ctx.admin = admin;
            const accessDenial = getAdminAccessDenial(admin, ctx.path);
            if (accessDenial) {
                ctx.status = 403;
                ctx.body = 'Not found.';
                return;
            }
            await next();
            return;
        }
        if ('rejectReason' in nuiAuthResult && nuiAuthResult.rejectReason) {
            console.verbose.warn(`[assetAuth] Token auth failed: ${nuiAuthResult.rejectReason}`);
        }
    }

    ctx.status = 404;
    ctx.body = 'Not found.';
};
