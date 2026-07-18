const modulename = 'WebServer:FxArtifactList';
import { z } from 'zod';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { txEnv, txHostConfig } from '@core/globalData';
import got from '@lib/got';
import consoleFactory from '@lib/console';
import type { ArtifactListResp, ArtifactTierInfo } from '@shared/otherTypes';
const console = consoleFactory(modulename);

const changelogRespSchema = z
    .object({
        recommended: z.coerce.number().positive(),
        recommended_download: z.string().url(),
        optional: z.coerce.number().positive(),
        optional_download: z.string().url(),
        latest: z.coerce.number().positive(),
        latest_download: z.string().url(),
        critical: z.coerce.number().positive(),
        critical_download: z.string().url(),
    })
    .passthrough();

/**
 * Queries the changelog API and returns all artifact tiers + current status.
 */
export default async function FxArtifactList(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('all_permissions', modulename)) {
        return ctx.utils.error(403, 'Only admins with all permissions can manage artifacts.');
    }

    let tiers: ArtifactTierInfo[] = [];
    try {
        const osType = txEnv.isWindows ? 'win32' : 'linux';
        const cacheBuster = Math.floor(Date.now() / 5_000_000);
        const reqUrl = `https://changelogs-live.fivem.net/api/changelog/versions/${osType}/server?${cacheBuster}`;
        const resp = await got(reqUrl, { timeout: { request: 10_000 } }).json();
        const parsed = changelogRespSchema.parse(resp);

        const tierNames = ['latest', 'recommended', 'optional', 'critical'] as const;
        for (const tier of tierNames) {
            tiers.push({
                tier,
                version: parsed[tier],
                downloadUrl: parsed[`${tier}_download`],
            });
        }
    } catch (error) {
        console.verbose.warn(`Failed to fetch artifact list: ${emsg(error)}`);
    }

    const resp: ArtifactListResp = {
        currentVersion: txEnv.fxsVersion,
        currentVersionTag: txEnv.fxsVersionTag,
        minCompatibleVersion: txEnv.minFxsVersion,
        tiers,
        updateStatus: txCore.fxUpdater.status,
        customDownloadEnabled: txHostConfig.artifactCustomDownloadEnabled,
    };
    return ctx.send(resp);
}
