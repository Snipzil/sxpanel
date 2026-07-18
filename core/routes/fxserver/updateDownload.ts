const modulename = 'WebServer:FxArtifactDownload';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { txEnv, txHostConfig } from '@core/globalData';
import consoleFactory from '@lib/console';
import { ApiToastResp } from '@shared/genericApiTypes';
const console = consoleFactory(modulename);

const ALLOWED_DOWNLOAD_DOMAINS = ['runtime.fivem.net'] as const;

/**
 * Triggers artifact download from a provided URL.
 */
export default async function FxArtifactDownload(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'Only admins with all permissions can manage artifacts.',
        });
    }

    const { url, version } = ctx.request.body ?? {};
    if (typeof url !== 'string' || !url.startsWith('https://')) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'A valid HTTPS download URL is required.',
        });
    }
    try {
        const parsed = new URL(url);
        if (!ALLOWED_DOWNLOAD_DOMAINS.includes(parsed.hostname as (typeof ALLOWED_DOWNLOAD_DOMAINS)[number])) {
            return ctx.send<ApiToastResp>({
                type: 'error',
                msg: `Download URL hostname is not allowed. Permitted: ${ALLOWED_DOWNLOAD_DOMAINS.join(', ')}`,
            });
        }
    } catch {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'A valid HTTPS download URL is required.',
        });
    }
    if (typeof version !== 'string' || !version) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'A version identifier is required.',
        });
    }
    const versionNum = parseInt(version);
    if (!isNaN(versionNum) && versionNum < txEnv.minFxsVersion) {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: `Build ${versionNum} is not compatible with sxPanel (minimum: ${txEnv.minFxsVersion}). Downgrading below it would prevent sxPanel from booting.`,
        });
    }
    if (!txHostConfig.artifactCustomDownloadEnabled && version === 'custom') {
        return ctx.send<ApiToastResp>({
            type: 'error',
            msg: 'Custom artifact download URLs are disabled by the host.',
        });
    }

    //Start download in background (non-blocking)
    txCore.fxUpdater.download(url).catch(() => {
        //Error is already stored in status
    });
    ctx.admin.logCommand(`FXServer artifact download started (build ${version})`, 'artifact.download');

    return ctx.send<ApiToastResp>({
        type: 'success',
        msg: `Downloading FXServer build ${version}...`,
    });
}
