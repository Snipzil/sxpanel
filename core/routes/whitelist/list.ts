const modulename = 'WebServer:WhitelistList';
import Fuse from 'fuse.js';
import { DatabaseWhitelistRequestsType } from '@modules/Database/databaseTypes';
import cleanPlayerName from '@shared/cleanPlayerName';
import { GenericApiErrorResp } from '@shared/genericApiTypes';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import type { ApiWhitelistPlayersResp } from '@shared/whitelistApiTypes';
const console = consoleFactory(modulename);

/**
 * Returns the output page containing the action log, and the console log
 */
export default async function WhitelistList(ctx: AuthedCtx) {
    const table = ctx.params.table;

    if (table === 'requests') {
        return await handleRequests(ctx);
    } else if (table === 'approvals') {
        return await handleApprovals(ctx);
    } else if (table === 'players') {
        return await handlePlayers(ctx);
    } else {
        return ctx.send({ error: 'unknown table' });
    }
}

async function handleRequests(ctx: AuthedCtx) {
    type resp =
        | {
              cntTotal: number;
              cntFiltered: number;
              newest: number;
              totalPages: number;
              currPage: number;
              requests: DatabaseWhitelistRequestsType[];
          }
        | GenericApiErrorResp;
    const sendTypedResp = (data: resp) => ctx.send(data);

    const requests = txCore.database.whitelist.findManyRequests().reverse();

    let filtered = requests;
    const searchString = ctx.request.query?.searchString;
    if (typeof searchString === 'string' && searchString.length) {
        const fuse = new Fuse(requests, {
            keys: ['id', 'playerPureName', 'discordTag'],
            threshold: 0.3,
        });
        const { pureName } = cleanPlayerName(searchString);
        filtered = fuse.search(pureName).map((x) => x.item);
    }

    const pageSize = 15;
    const pageinput = ctx.request.query?.page;
    let currPage = 1;
    if (typeof pageinput === 'string') {
        if (/^\d+$/.test(pageinput)) {
            currPage = parseInt(pageinput);
            if (currPage < 1) {
                return sendTypedResp({ error: 'page should be >= 1' });
            }
        } else {
            return sendTypedResp({ error: 'page should be a number' });
        }
    }
    const skip = (currPage - 1) * pageSize;
    const paginated = filtered.slice(skip, skip + pageSize);

    return sendTypedResp({
        cntTotal: requests.length,
        cntFiltered: filtered.length,
        newest: requests.length ? requests[0].tsLastAttempt : 0,
        totalPages: Math.ceil(filtered.length / pageSize),
        currPage,
        requests: paginated,
    });
}

async function handleApprovals(ctx: AuthedCtx) {
    const sendTypedResp = (data: ReturnType<typeof txCore.database.whitelist.findManyApprovals>) => ctx.send(data);

    const approvals = txCore.database.whitelist.findManyApprovals().reverse();
    return sendTypedResp(approvals);
}

async function handlePlayers(ctx: AuthedCtx) {
    const sendTypedResp = (data: ApiWhitelistPlayersResp) => ctx.send(data);

    const activeEntries = txCore.database.whitelist
        .findManyEntries((entry) => typeof entry.tsFirstConnect === 'number')
        .sort((a, b) => (b.tsFirstConnect ?? 0) - (a.tsFirstConnect ?? 0));

    let entries = activeEntries.map((entry) => ({
        name: entry.playerName,
        identifier: entry.identifier,
        tsApproved: entry.tsGranted,
        approvedBy: entry.grantedBy,
        source: entry.source,
    }));

    const searchString = ctx.request.query?.searchString;
    if (typeof searchString === 'string' && searchString.length) {
        const fuse = new Fuse(entries, {
            keys: ['name', 'identifier', 'approvedBy'],
            threshold: 0.3,
        });
        const { pureName } = cleanPlayerName(searchString);
        entries = fuse.search(pureName).map((x) => x.item);
    }

    const pageSize = 25;
    const pageinput = ctx.request.query?.page;
    let currPage = 1;
    if (typeof pageinput === 'string') {
        if (/^\d+$/.test(pageinput)) {
            currPage = parseInt(pageinput);
            if (currPage < 1) {
                return sendTypedResp({ error: 'page should be >= 1' });
            }
        } else {
            return sendTypedResp({ error: 'page should be a number' });
        }
    }
    const skip = (currPage - 1) * pageSize;
    const paginated = entries.slice(skip, skip + pageSize);

    return sendTypedResp({
        cntTotal: activeEntries.length,
        cntFiltered: entries.length,
        totalPages: Math.ceil(entries.length / pageSize),
        currPage,
        players: paginated,
    });
}
