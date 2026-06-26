const modulename = 'WebServer:TopLevelMw';
import crypto from 'node:crypto';
import { txEnv } from '@core/globalData';
import { AppError } from '@lib/errors';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);
import { Next } from 'koa';
import { RawKoaCtx } from '../ctxTypes';

//Token Bucket (Rate Limiter)
const maxTokens = 20;
const tokensPerInterval = 5;
let availableTokens = maxTokens;
let suppressedErrors = 0;
setInterval(() => {
    availableTokens = Math.min(availableTokens + tokensPerInterval, maxTokens);
    if (suppressedErrors) {
        console.warn(`Suppressed ${suppressedErrors} errors to prevent log spam.`);
        suppressedErrors = 0;
    }
}, 5_000);
const consumePrintToken = () => {
    if (availableTokens > 0) {
        availableTokens--;
        return true;
    }
    suppressedErrors++;
    return false;
};

//Consts
const timeoutLimit = 47 * 1000; //REQ_TIMEOUT_REALLY_REALLY_LONG is 45s

/**
 * Middleware responsible for timeout/error/no-output/413
 */
const topLevelMw = async (ctx: RawKoaCtx, next: Next) => {
    ctx.set('Server', `fxPanel v${txEnv.txaVersion}`);
    const incomingRid = (ctx.get('x-request-id') ?? '').trim();
    const requestId = incomingRid.length > 0 && incomingRid.length <= 128 ? incomingRid : crypto.randomUUID();
    ctx.set('X-Request-Id', requestId);

    let timerId;
    let didTimeout = false;
    const timeout = new Promise((_, reject) => {
        timerId = setTimeout(() => {
            didTimeout = true;
            reject(new Error('route_timed_out'));
        }, timeoutLimit);
    });
    try {
        await Promise.race([timeout, next()]);
        if (typeof ctx.body == 'undefined' || (typeof ctx.body == 'string' && !ctx.body.length)) {
            console.verbose.warn(`Route without output: ${ctx.path}`);
            return (ctx.body = '[no output from route]');
        }
    } catch (error) {
        const prefix = `[fxPanel v${txEnv.txaVersion}]`;
        const reqPath = ctx.path.length > 80 ? `${ctx.path.slice(0, 77)}...` : ctx.path;
        const methodName = 'routeHandler';

        ctx.type = 'text/plain';
        ctx.set('X-Content-Type-Options', 'nosniff');

        if (didTimeout) {
            const desc = `Route timed out: ${reqPath}`;
            ctx.status = 408;
            ctx.body = { error: desc };
            if (consumePrintToken()) console.error(`${prefix} ${desc} | reqId=${requestId}`, methodName);
        } else if (error instanceof AppError) {
            ctx.status = error.httpStatus;
            ctx.body = { error: 'Request failed.' };
            if (error.httpStatus >= 500 && consumePrintToken()) {
                console.error(`${prefix} AppError ${error.httpStatus} | ${reqPath} | reqId=${requestId}`, methodName);
            }
        } else if (ctx.status === 413) {
            const desc = `Entity too large for: ${reqPath}`;
            ctx.status = 413;
            ctx.body = { error: desc };
            if (consumePrintToken()) console.verbose.error(`${desc} | reqId=${requestId}`, methodName);
        } else {
            ctx.status = 500;
            ctx.body = { error: 'Internal server error.' };
            if (consumePrintToken()) {
                console.error(`${prefix} Internal Error | Route: ${reqPath} | reqId=${requestId}`, methodName);
                console.verbose.dir(error);
            }
        }
    } finally {
        //Cannot forget about this or the ctx will only be released from memory after the timeout,
        //making it easier to crash the server in a DDoS attack
        clearTimeout(timerId);
    }
};

export default topLevelMw;
