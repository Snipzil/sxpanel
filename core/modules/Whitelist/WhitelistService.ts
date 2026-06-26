const modulename = 'Whitelist:Service';
import cleanPlayerName from '@shared/cleanPlayerName';
import type { PlayerIdsObjectType } from '@shared/otherTypes';
import type { WhitelistWorkflow } from '@shared/whitelistTypes';
import playerResolver from '@lib/player/playerResolver';
import { now } from '@lib/misc';
import consoleFactory from '@lib/console';
import { renderDeferralCard, type RenderDeferralCardInput } from './deferralCard';
import type { DeferralScenarioId } from '@shared/deferralCardTypes';
import { isApplicationsOpen } from './schedule';
import { dispatchWhitelistWebhooks } from './webhooks';

const console = consoleFactory(modulename);

export type WhitelistJoinAllow = { allow: true };
export type WhitelistJoinDeny = { allow: false; reason: string };
export type WhitelistJoinResult = WhitelistJoinAllow | WhitelistJoinDeny;

export type WhitelistJoinContext = {
    validIdsArray: string[];
    validIdsObject: PlayerIdsObjectType;
    validHwidsArray: string[];
    playerName: string;
};

export function getActiveWorkflow(): WhitelistWorkflow | undefined {
    const workflows = txConfig.whitelist.workflows ?? [];
    const activeId = txConfig.whitelist.activeWorkflowId;
    return workflows.find((w) => w.id === activeId) ?? workflows[0];
}

async function buildRejectionReason(
    scenario: DeferralScenarioId | string,
    tokens: Omit<RenderDeferralCardInput, 'scenario'>,
) {
    return renderDeferralCard({
        scenario,
        ...tokens,
        guildName: txCore.discordBot.guildName,
    });
}

function emitWhitelistEvent(
    type: Parameters<typeof txCore.database.whitelist.recordEvent>[0]['type'],
    data: Omit<Parameters<typeof txCore.database.whitelist.recordEvent>[0], 'type' | 'id' | 'ts'>,
) {
    const eventId = txCore.database.whitelist.recordEvent({ type, ...data });
    dispatchWhitelistWebhooks(type, { ...data }).catch((error) => {
        console.verbose.warn(`Whitelist webhook dispatch failed: ${emsg(error)}`);
    });
    return eventId;
}

async function resolveDiscordProfile(discordId?: string) {
    if (!discordId || !txCore.discordBot.isClientReady) return {};
    try {
        return await txCore.discordBot.resolveMemberProfile(discordId);
    } catch {
        return {};
    }
}

function hasActiveWhitelistEntry(validIdsArray: string[]) {
    return (
        txCore.database.whitelist.findManyEntries(
            (entry) => validIdsArray.includes(entry.identifier) && typeof entry.tsFirstConnect === 'number',
        ).length > 0
    );
}

function consumePreApprovals(
    validIdsArray: string[],
    validIdsObject: PlayerIdsObjectType,
    validHwidsArray: string[],
    playerName: string,
    workflow: WhitelistWorkflow,
) {
    const pending = txCore.database.whitelist.findManyEntries(
        (entry) => validIdsArray.includes(entry.identifier) && typeof entry.tsFirstConnect !== 'number',
    );
    if (!pending.length) return false;

    const ts = now();
    const { displayName, pureName } = cleanPlayerName(playerName);
    let player;
    try {
        if (validIdsObject.license) {
            player = playerResolver(null, null, validIdsObject.license);
        }
    } catch {
        /* player not registered yet */
    }

    for (const entry of pending) {
        txCore.database.whitelist.consumeEntry(entry.identifier, ts);
    }

    if (player?.license) {
        player.setWhitelist(true);
    } else if (validIdsObject.license) {
        txCore.database.players.register({
            license: validIdsObject.license,
            ids: validIdsArray,
            hwids: validHwidsArray,
            displayName,
            pureName,
            playTime: 0,
            tsLastConnection: ts,
            tsJoined: ts,
        });
    }

    txCore.database.whitelist.removeManyApplications({ license: validIdsObject.license, status: 'pending' });

    emitWhitelistEvent('entry.consumed', {
        identifier: pending[0].identifier,
        license: validIdsObject.license,
        meta: { workflowId: workflow.id },
    });

    txCore.fxRunner.sendEvent('whitelistPlayer', {
        action: 'added',
        license: validIdsObject.license,
        playerName: displayName,
        adminName: pending[0].grantedBy,
    });

    return true;
}

async function checkAdminOnly(ctx: WhitelistJoinContext): Promise<WhitelistJoinResult> {
    const textKeys = {
        mode_title: txCore.translator.t('whitelist_messages.admin_only.mode_title'),
        insufficient_ids: txCore.translator.t('whitelist_messages.admin_only.insufficient_ids'),
        deny_message: txCore.translator.t('whitelist_messages.admin_only.deny_message'),
    };

    if (!ctx.validIdsObject.license && !ctx.validIdsObject.discord) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_admin_insufficient_ids', {
                title: textKeys.mode_title,
                body: textKeys.insufficient_ids,
            }),
        };
    }

    const admin = txCore.adminStore.getAdminByIdentifiers(ctx.validIdsArray);
    if (admin) return { allow: true };

    return {
        allow: false,
        reason: await buildRejectionReason('whitelist_admin_denied', {
            title: textKeys.mode_title,
            body: textKeys.deny_message,
        }),
    };
}

async function checkDiscordMember(ctx: WhitelistJoinContext): Promise<WhitelistJoinResult> {
    const guildname = `<guildname>${txCore.discordBot.guildName}</guildname>`;
    const textKeys = {
        mode_title: txCore.translator.t('whitelist_messages.guild_member.mode_title'),
        insufficient_ids: txCore.translator.t('whitelist_messages.guild_member.insufficient_ids'),
        deny_title: txCore.translator.t('whitelist_messages.guild_member.deny_title'),
        deny_message: txCore.translator.t('whitelist_messages.guild_member.deny_message', { guildname }),
    };

    if (!ctx.validIdsObject.discord) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_discord_member_insufficient_ids', {
                title: textKeys.mode_title,
                body: textKeys.insufficient_ids,
            }),
        };
    }

    try {
        const { isMember } = await txCore.discordBot.resolveMemberRoles(ctx.validIdsObject.discord);
        if (isMember) return { allow: true };
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_discord_member_denied', {
                title: textKeys.deny_title,
                body: textKeys.deny_message,
            }),
        };
    } catch (error) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_error', {
                title: 'Error validating Discord Server Member Whitelist:',
                body: `<code>${emsg(error)}</code>`,
            }),
        };
    }
}

async function checkDiscordRoles(ctx: WhitelistJoinContext, workflow: WhitelistWorkflow): Promise<WhitelistJoinResult> {
    const guildname = `<guildname>${txCore.discordBot.guildName}</guildname>`;
    const textKeys = {
        mode_title: txCore.translator.t('whitelist_messages.guild_roles.mode_title'),
        insufficient_ids: txCore.translator.t('whitelist_messages.guild_roles.insufficient_ids'),
        deny_notmember_title: txCore.translator.t('whitelist_messages.guild_roles.deny_notmember_title'),
        deny_notmember_message: txCore.translator.t('whitelist_messages.guild_roles.deny_notmember_message', {
            guildname,
        }),
        deny_noroles_title: txCore.translator.t('whitelist_messages.guild_roles.deny_noroles_title'),
        deny_noroles_message: txCore.translator.t('whitelist_messages.guild_roles.deny_noroles_message', { guildname }),
    };

    if (!ctx.validIdsObject.discord) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_discord_roles_insufficient_ids', {
                title: textKeys.mode_title,
                body: textKeys.insufficient_ids,
            }),
        };
    }

    const requiredRoles = workflow.discordRoleIds ?? [];

    try {
        const { isMember, memberRoles } = await txCore.discordBot.resolveMemberRoles(ctx.validIdsObject.discord);
        if (!isMember) {
            return {
                allow: false,
                reason: await buildRejectionReason('whitelist_discord_roles_not_member', {
                    title: textKeys.deny_notmember_title,
                    body: textKeys.deny_notmember_message,
                }),
            };
        }
        const matchingRole = requiredRoles.find((role) => memberRoles?.includes(role));
        if (matchingRole) return { allow: true };
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_discord_roles_no_roles', {
                title: textKeys.deny_noroles_title,
                body: textKeys.deny_noroles_message,
            }),
        };
    } catch (error) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_error', {
                title: 'Error validating Discord Role Whitelist:',
                body: `<code>${emsg(error)}</code>`,
            }),
        };
    }
}

async function checkLicenseWorkflow(
    ctx: WhitelistJoinContext,
    workflow: WhitelistWorkflow,
): Promise<WhitelistJoinResult> {
    const textKeys = {
        mode_title: txCore.translator.t('whitelist_messages.approved_license.mode_title'),
        insufficient_ids: txCore.translator.t('whitelist_messages.approved_license.insufficient_ids'),
        deny_title: txCore.translator.t('whitelist_messages.approved_license.deny_title'),
    };

    if (!ctx.validIdsObject.license) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_insufficient_license', {
                title: textKeys.mode_title,
                body: textKeys.insufficient_ids,
            }),
        };
    }

    if (hasActiveWhitelistEntry(ctx.validIdsArray)) {
        return { allow: true };
    }

    try {
        const player = playerResolver(null, null, ctx.validIdsObject.license);
        const dbData = player.getDbData();
        if (dbData?.tsWhitelisted) {
            return { allow: true };
        }
    } catch {
        /* not registered */
    }

    if (consumePreApprovals(ctx.validIdsArray, ctx.validIdsObject, ctx.validHwidsArray, ctx.playerName, workflow)) {
        return { allow: true };
    }

    if (!isApplicationsOpen()) {
        return {
            allow: false,
            reason: await buildRejectionReason('whitelist_schedule_closed', {
                title: textKeys.deny_title,
                body: txConfig.whitelist.schedule.closedMessage,
            }),
        };
    }

    const ts = now();
    const { displayName, pureName } = cleanPlayerName(ctx.playerName);
    const { tag: discordTag, avatar: discordAvatar } = await resolveDiscordProfile(ctx.validIdsObject.discord);

    let applicationId: string;
    const existing = txCore.database.whitelist.findManyApplications({
        license: ctx.validIdsObject.license,
        status: 'pending',
    });
    if (existing.length) {
        applicationId = existing[0].id;
        txCore.database.whitelist.updateApplication(ctx.validIdsObject.license, {
            playerDisplayName: displayName,
            playerPureName: pureName,
            discordTag,
            discordAvatar,
            tsLastAttempt: ts,
        });
    } else {
        const saved = txCore.database.whitelist.registerApplication({
            license: ctx.validIdsObject.license,
            status: 'pending',
            workflowId: workflow.id,
            playerDisplayName: displayName,
            playerPureName: pureName,
            discordTag,
            discordAvatar,
            tsCreated: ts,
            tsLastAttempt: ts,
        });
        applicationId = saved.id;
        emitWhitelistEvent('application.created', {
            license: ctx.validIdsObject.license,
            applicationId,
            meta: { playerName: displayName, workflowId: workflow.id },
        });
        txCore.logger.system.write(
            'WHITELIST',
            `Created whitelist application ${applicationId} for "${displayName}" (${ctx.validIdsObject.license}).`,
            'action',
            { actionId: 'whitelist.application.create' },
        );
        txCore.discordBot.notifyWhitelistApplicationCreated(applicationId, ctx.validIdsObject.license, displayName);
        txCore.fxRunner.sendEvent('whitelistRequest', {
            action: 'requested',
            playerName: displayName,
            requestId: applicationId,
            license: ctx.validIdsObject.license,
        });
    }

    return {
        allow: false,
        reason: await buildRejectionReason('whitelist_pending', {
            title: textKeys.deny_title,
            body: '',
            requestId: applicationId,
        }),
    };
}

/**
 * Evaluates whether a connecting player passes the active whitelist workflow.
 */
export async function evaluateJoin(ctx: WhitelistJoinContext): Promise<WhitelistJoinResult> {
    const pending = txCore.addonManager?.consumePendingAddonDeferral(ctx.validIdsObject.license);
    if (pending) {
        return {
            allow: false,
            reason: await renderDeferralCard({
                scenario: pending.scenarioId,
                body: pending.customMessage ?? '',
                playerName: pending.playerName ?? ctx.playerName,
                license: ctx.validIdsObject.license,
                discordId: ctx.validIdsObject.discord,
                identifiers: ctx.validIdsArray,
            }),
        };
    }

    if (!txConfig.whitelist.enabled) {
        return { allow: true };
    }

    const workflow = getActiveWorkflow();
    if (!workflow || workflow.type === 'disabled' || workflow.type === 'external_whitelist') {
        return { allow: true };
    }

    switch (workflow.type) {
        case 'auto_admin':
            return checkAdminOnly(ctx);
        case 'auto_discord_member':
            return checkDiscordMember(ctx);
        case 'auto_discord_role':
            return checkDiscordRoles(ctx, workflow);
        case 'manual_review':
            return checkLicenseWorkflow(ctx, workflow);
        default:
            return { allow: true };
    }
}
