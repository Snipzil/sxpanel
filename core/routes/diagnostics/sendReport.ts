const modulename = 'WebServer:SendDiagnosticsReport';
import os from 'node:os';
import { gzipSync } from 'node:zlib';
import got from '@lib/got';
import { txEnv, txHostConfig } from '@core/globalData';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
import * as diagnosticsFuncs from '@lib/diagnostics';
import { redactApiKeys, redactStartupSecrets } from '@lib/misc';
import {
    type ServerDataContentType,
    type ServerDataConfigsType,
    getServerDataContent,
    getServerDataConfigs,
} from '@lib/fxserver/serverData';
import MemCache from '@lib/MemCache';
import consoleFactory, { getLogBuffer } from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import scanMonitorFiles from '@lib/scanMonitorFiles';
const console = consoleFactory(modulename);

//Consts & Helpers
const reportIdCache = new MemCache<string>(60);
const maskedKeywords = ['key', 'license', 'pass', 'private', 'secret', 'token', 'webhook'];
const maskString = (input: string) => input.replace(/\w/gi, 'x');
const maskIps = (input: string) => input.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/gi, 'x.x.x.x');
const getDiagnosticsSectionError = (sectionName: string, error: unknown) => ({
    error: `Failed to collect ${sectionName}: ${emsg(error)}`,
});
const getReportFailureReason = (error: unknown) => {
    const responseBody = (error as any)?.response?.body;
    if (responseBody && typeof responseBody === 'object') {
        if (typeof responseBody.message === 'string' && responseBody.message.trim()) {
            return responseBody.message.trim();
        }
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) {
            return responseBody.error.trim();
        }
    }

    let rawBody: string | undefined;
    if (typeof responseBody === 'string') {
        rawBody = responseBody.trim();
    } else if (Buffer.isBuffer(responseBody)) {
        rawBody = responseBody.toString('utf8').trim();
    }
    if (rawBody) {
        try {
            const parsedBody = JSON.parse(rawBody);
            if (typeof parsedBody?.message === 'string' && parsedBody.message.trim()) {
                return parsedBody.message.trim();
            }
            if (typeof parsedBody?.error === 'string' && parsedBody.error.trim()) {
                return parsedBody.error.trim();
            }
        } catch {
            return rawBody.slice(0, 500);
        }
    }

    const statusCode = (error as any)?.response?.statusCode;
    const statusMessage = (error as any)?.response?.statusMessage;
    const fallbackReason = emsg(error);
    const statusLabel =
        typeof statusCode === 'number'
            ? `HTTP ${statusCode}${typeof statusMessage === 'string' && statusMessage ? ` ${statusMessage}` : ''}`
            : undefined;

    return [statusLabel, fallbackReason]
        .filter((value, index, array) => value && array.indexOf(value) === index)
        .join(' - ');
};
type ServerLogType = {
    ts: number;
    type: string;
    src: {
        id: string | false;
        name: string;
    };
    msg: string;
};

/**
 * Prepares and sends the diagnostics report to txAPI
 */
export default async function SendDiagnosticsReport(ctx: AuthedCtx) {
    type SuccessResp = {
        reportId: string;
    };
    const sendTypedResp = (data: SuccessResp | GenericApiErrorResp) => ctx.send(data);

    //Rate limit (and cache) report submissions
    const cachedReportId = reportIdCache.get();
    if (cachedReportId) {
        return sendTypedResp({
            error: `You can send at most one report per minute. Your last report ID was ${cachedReportId}.`,
        });
    }

    //Diagnostics
    const [hostResult, txadminResult, fxserverResult, processesResult] = await Promise.allSettled([
        diagnosticsFuncs.getHostData(),
        diagnosticsFuncs.getTxAdminData(),
        diagnosticsFuncs.getFXServerData(),
        diagnosticsFuncs.getProcessesData(),
    ]);

    const diagnostics: Record<string, unknown> = {
        host:
            hostResult.status === 'fulfilled'
                ? hostResult.value
                : getDiagnosticsSectionError('host diagnostics', hostResult.reason),
        txadmin:
            txadminResult.status === 'fulfilled'
                ? txadminResult.value
                : getDiagnosticsSectionError('sxPanel diagnostics', txadminResult.reason),
        fxserver:
            fxserverResult.status === 'fulfilled'
                ? fxserverResult.value
                : getDiagnosticsSectionError('FXServer diagnostics', fxserverResult.reason),
        processes:
            processesResult.status === 'fulfilled'
                ? processesResult.value
                : getDiagnosticsSectionError('process diagnostics', processesResult.reason),
    };
    try {
        diagnostics.discordBot = txCore.discordBot.getDiagnostics();
    } catch (error) {
        diagnostics.discordBot = getDiagnosticsSectionError('Discord bot diagnostics', error);
    }
    try {
        diagnostics.botCommandAnalytics = txCore.database.botAnalytics.getCommandAnalytics(30);
    } catch (error) {
        diagnostics.botCommandAnalytics = getDiagnosticsSectionError('bot command analytics', error);
    }
    const adminList = (txCore.adminStore.getRawAdminsList() as any[]).map((a) => ({
        ...a,
        password_hash: '[REDACTED]',
    }));
    const storedConfigs = txCore.configStore.getStoredConfig() as any;
    if (storedConfigs?.discordBot?.token) {
        storedConfigs.discordBot.token = '[REDACTED]';
    }
    if (storedConfigs?.server?.startupArgs) {
        storedConfigs.server.startupArgs = redactStartupSecrets(storedConfigs.server.startupArgs);
    }

    //Env vars
    const envVars: Record<string, string> = {};
    for (const [envKey, envValue] of Object.entries(process.env)) {
        if (!envValue) continue;

        if (maskedKeywords.some((kw) => envKey.toLowerCase().includes(kw))) {
            envVars[envKey] = maskString(envValue);
        } else {
            envVars[envKey] = envValue;
        }
    }

    //Remove IP from logs
    const txSystemLog = maskIps(getLogBuffer());

    const rawTxActionLog = await txCore.logger.system.getSessionFileContent();
    const txActionLog =
        typeof rawTxActionLog !== 'string'
            ? 'error reading log file'
            : maskIps(rawTxActionLog).split('\n').slice(-500).join('\n');

    const serverLog = (txCore.logger.server.getRecentBuffer(500) as ServerLogType[]).map((l) => ({
        ...l,
        msg: maskIps(l.msg),
    }));
    const fxserverLog = maskIps(txCore.logger.fxserver.getRecentBufferString());

    //Getting server data content
    let serverDataContent: ServerDataContentType = [];
    let cfgFiles: ServerDataConfigsType = [];
    const serverPaths = txCore.fxRunner.serverPaths;
    if (serverPaths?.dataPath) {
        serverDataContent = await getServerDataContent(serverPaths.dataPath);
        const rawCfgFiles = await getServerDataConfigs(serverPaths.dataPath, serverDataContent);
        cfgFiles = rawCfgFiles.map(([fName, fData]) => [fName, redactApiKeys(fData)]);
    }

    //Database & perf stats
    let dbStats = {};
    try {
        dbStats = txCore.database.stats.getDatabaseStats();
    } catch (error) {
        /* database stats unavailable */
    }

    let perfSvMain: ReturnType<typeof txCore.metrics.svRuntime.getServerPerfSummary> = null;
    try {
        perfSvMain = txCore.metrics.svRuntime.getServerPerfSummary();
    } catch (error) {
        /* perf stats unavailable */
    }

    //Monitor integrity check
    let monitorContent = null;
    try {
        monitorContent = await scanMonitorFiles();
    } catch (error) {
        /* monitor files unavailable */
    }

    const reportMeta = {
        generatedAt: new Date().toISOString(),
        payload: {
            contentEncoding: 'gzip',
            schemaVersion: 2,
            jsonBytes: 0,
            gzipBytes: 0,
        },
        process: {
            pid: process.pid,
            ppid: process.ppid,
            platform: process.platform,
            arch: process.arch,
            uptimeSeconds: Math.round(process.uptime()),
            execArgv: redactStartupSecrets(process.execArgv).map((arg) => maskIps(arg)),
            versions: Object.fromEntries(
                Object.entries(process.versions).sort(([left], [right]) => left.localeCompare(right)),
            ),
            resourceUsage: process.resourceUsage(),
        },
        host: {
            type: os.type(),
            release: os.release(),
            arch: os.arch(),
            endianness: os.endianness(),
            uptimeSeconds: Math.round(os.uptime()),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            loadAverage: os.loadavg(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: Intl.DateTimeFormat().resolvedOptions().locale,
        },
    };

    const reportData = {
        $schemaVersion: 2,
        $txVersion: txEnv.txaVersion,
        $fxVersion: String(txEnv.fxsVersion),
        $provider: txHostConfig.providerName ?? undefined,
        reportMeta,
        diagnostics,
        txSystemLog,
        txActionLog,
        serverLog,
        fxserverLog,
        envVars,
        perfSvMain,
        dbStats,
        settings: storedConfigs,
        adminList,
        serverDataContent,
        cfgFiles,
        monitorContent,
    };

    // //Preparing request
    let jsonBody = JSON.stringify(reportData);
    let gzippedBody = gzipSync(jsonBody);
    for (let attempt = 0; attempt < 3; attempt++) {
        const nextJsonBytes = Buffer.byteLength(jsonBody);
        const nextGzipBytes = gzippedBody.byteLength;
        if (reportMeta.payload.jsonBytes === nextJsonBytes && reportMeta.payload.gzipBytes === nextGzipBytes) {
            break;
        }
        reportMeta.payload.jsonBytes = nextJsonBytes;
        reportMeta.payload.gzipBytes = nextGzipBytes;
        jsonBody = JSON.stringify(reportData);
        gzippedBody = gzipSync(jsonBody);
    }
    const requestOptions = {
        retry: { limit: 1 },
        body: gzippedBody,
        headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
        },
    };

    // Making HTTP request — URL is fixed (no user-controlled SSRF surface here).
    try {
        type ResponseType = { reportId: string } | { error: string; message?: string };
        const apiResp = (await got
            .post('https://sxpanel.org/api/diagnostics', requestOptions)
            .json()) as ResponseType;
        if ('reportId' in apiResp) {
            reportIdCache.set(apiResp.reportId);
            console.warn(`Diagnostics data report ID ${apiResp.reportId} sent by ${ctx.admin.name}`);
            return sendTypedResp({ reportId: apiResp.reportId });
        } else {
            console.verbose.dir(apiResp);
            return sendTypedResp({ error: `Report failed: ${apiResp.message ?? apiResp.error}` });
        }
    } catch (error) {
        return sendTypedResp({ error: `Report failed: ${getReportFailureReason(error)}` });
    }
}
