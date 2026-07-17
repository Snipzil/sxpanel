import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { ResourcesListResp } from '@shared/resourcesApiTypes';
import { fetchFreshResourceReport, processResources } from './shared';

/**
 * Returns the resource list as JSON grouped by folder
 */
export default async function ResourcesList(ctx: AuthedCtx) {
    const sendTypedResp = (data: ResourcesListResp) => ctx.send(data);

    const reportResult = await fetchFreshResourceReport();
    if (!reportResult.ok) {
        return sendTypedResp({ error: reportResult.error });
    }

    return sendTypedResp(processResources(reportResult.resources, txCore.fxResources.getUpdateNotices()));
}
