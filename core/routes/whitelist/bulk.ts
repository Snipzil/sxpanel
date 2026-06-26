const modulename = 'WebServer:WhitelistBulk';
import { now } from '@lib/misc';
import { parsePlayerId } from '@lib/player/idUtils';
import type { ApiWhitelistBulkExportResp, ApiWhitelistBulkImportResp } from '@shared/whitelistApiTypes';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import { DuplicateKeyError } from '@modules/Database/dbUtils';

export default async function WhitelistBulk(ctx: AuthedCtx) {
    if (!ctx.admin.testPermission('players.whitelist', modulename)) {
        return ctx.send({ error: "You don't have permission to manage whitelist entries." });
    }

    if (ctx.request.method === 'GET') {
        const sendTypedResp = (data: ApiWhitelistBulkExportResp) => ctx.send(data);
        const entries = txCore.database.whitelist.findManyEntries().map((entry) => ({
            name: entry.playerName,
            identifier: entry.identifier,
            approvedBy: entry.grantedBy,
            tsApproved: entry.tsGranted,
            source: entry.source,
        }));
        return sendTypedResp({ entries });
    }

    const sendTypedResp = (data: ApiWhitelistBulkImportResp) => ctx.send(data);
    const rows = ctx.request.body?.entries;
    if (!Array.isArray(rows)) {
        return sendTypedResp({ error: 'entries array required' });
    }

    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
        if (typeof row?.identifier !== 'string') {
            skipped++;
            continue;
        }
        const { isIdValid, idlowerCased } = parsePlayerId(row.identifier);
        if (!isIdValid || !idlowerCased) {
            skipped++;
            continue;
        }
        const license = idlowerCased.startsWith('license:') ? idlowerCased.substring(8) : undefined;
        try {
            txCore.database.whitelist.registerEntry({
                identifier: idlowerCased,
                tsGranted: typeof row.tsApproved === 'number' ? row.tsApproved : now(),
                grantedBy: row.approvedBy ?? ctx.admin.name,
                source: 'manual',
                playerName: row.name ?? idlowerCased,
                playerAvatar: null,
                license,
                tsFirstConnect: typeof row.tsFirstConnect === 'number' ? row.tsFirstConnect : undefined,
            });
            imported++;
        } catch (error) {
            if (error instanceof DuplicateKeyError) {
                skipped++;
            } else {
                return sendTypedResp({ error: `Import failed: ${emsg(error)}` });
            }
        }
    }

    ctx.admin.logAction(`Bulk imported ${imported} whitelist entries.`, 'whitelist.bulk.import');
    return sendTypedResp({ success: true, imported, skipped });
}
