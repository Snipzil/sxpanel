import { DuplicateKeyError } from '@modules/Database/dbUtils';
import { now } from '@lib/misc';
import { dispatchWhitelistWebhooks } from './webhooks';
import { getActiveWorkflow } from './WhitelistService';

export type WhitelistRequestActionResult = { success: true } | { error: string };

/**
 * Approves a pending whitelist application by request id.
 */
export function approveWhitelistRequest(requestId: string, adminName: string): WhitelistRequestActionResult {
    const requests = txCore.database.whitelist.findManyRequests({ id: requestId });
    if (!requests.length) {
        return { error: `Whitelist request ID ${requestId} not found.` };
    }

    const req = requests[0];
    const workflow = getActiveWorkflow();
    const playerName = req.discordTag ?? req.playerDisplayName;
    const identifier = `license:${req.license}`;

    try {
        txCore.database.whitelist.registerApproval({
            identifier,
            playerName,
            playerAvatar: req.discordAvatar ? req.discordAvatar : null,
            tsApproved: now(),
            approvedBy: adminName,
        });
        txCore.database.whitelist.updateApplication(req.license, {
            status: 'approved',
            tsDecided: now(),
            decidedBy: adminName,
            workflowId: workflow?.id,
        });
        txCore.database.whitelist.recordEvent({
            type: 'application.approved',
            license: req.license,
            applicationId: req.id,
            adminName,
        });
        dispatchWhitelistWebhooks('application.approved', {
            license: req.license,
            applicationId: req.id,
            adminName,
        }).catch(() => {});
        txCore.fxRunner.sendEvent('whitelistRequest', {
            action: 'approved',
            playerName,
            requestId: req.id,
            license: req.license,
            adminName,
        });
    } catch (error) {
        if (!(error instanceof DuplicateKeyError)) {
            return { error: `Failed to save wl approval: ${emsg(error)}` };
        }
    }

    return { success: true };
}

/**
 * Denies a pending whitelist application by request id.
 */
export function denyWhitelistRequest(requestId: string, adminName: string): WhitelistRequestActionResult {
    const requests = txCore.database.whitelist.findManyRequests({ id: requestId });
    if (!requests.length) {
        return { error: `Whitelist request ID ${requestId} not found.` };
    }

    const req = requests[0];
    try {
        txCore.database.whitelist.updateApplication(req.license, {
            status: 'denied',
            tsDecided: now(),
            decidedBy: adminName,
        });
        txCore.database.whitelist.recordEvent({
            type: 'application.denied',
            license: req.license,
            applicationId: req.id,
            adminName,
        });
        dispatchWhitelistWebhooks('application.denied', {
            license: req.license,
            applicationId: req.id,
            adminName,
        }).catch(() => {});
        txCore.fxRunner.sendEvent('whitelistRequest', {
            action: 'denied',
            playerName: req.playerDisplayName,
            requestId: req.id,
            license: req.license,
            adminName,
        });
    } catch (error) {
        return { error: `Failed to deny wl request: ${emsg(error)}` };
    }

    return { success: true };
}

/**
 * Approves or denies by Discord review thread id.
 */
export function handleWhitelistThreadReaction(
    threadId: string,
    action: 'approve' | 'deny',
    adminName: string,
): WhitelistRequestActionResult {
    const pending = txCore.database.whitelist.findManyApplications(
        (app) => app.discordThreadId === threadId && app.status === 'pending',
    );
    if (!pending.length) {
        return { error: 'No pending whitelist application linked to this thread.' };
    }

    return action === 'approve'
        ? approveWhitelistRequest(pending[0].id, adminName)
        : denyWhitelistRequest(pending[0].id, adminName);
}
