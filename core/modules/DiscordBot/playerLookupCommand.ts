import { msToShortishDuration } from '@lib/misc';
import { findPlayersByIdentifier } from '@lib/player/playerFinder';
import { emsg } from '@shared/emsg';
import { buildDiscordCardMessageFromEmbeds } from './componentsV2';
import { resolveAdminUser } from './bridgePermissions';
import {
    buildDeniedReply,
    buildFailedReply,
    buildSuccessResponse,
    translateBot,
    infoEmbedColor,
    commandFooter,
} from './bridgeReplyHelpers';

export const translatePlayerLookup = (key: string, data: Record<string, unknown> = {}) => {
    return translateBot(`player_lookup.${key}`, data);
};

export const translatePlayerLookupActionCount = (action: 'ban' | 'warn' | 'kick', count: number) => {
    return count === 1
        ? translateBot(`player_lookup.action_counts.${action}.one`)
        : translateBot(`player_lookup.action_counts.${action}.other`, { count });
};

export const buildPlayerLookupReply = (searchId: unknown, adminView: boolean, requesterId: unknown) => {
    if (adminView) {
        const adminResult = resolveAdminUser(requesterId);
        if ('reply' in adminResult) return adminResult;
    }

    if (typeof searchId !== 'string' || !searchId.trim().length) {
        return buildDeniedReply('danger', translateBot('common.invalid_identifier'), 'invalid_target');
    }

    let players;
    try {
        players = findPlayersByIdentifier(searchId.trim().toLowerCase());
    } catch (error) {
        return buildFailedReply('danger', translatePlayerLookup('lookup_failed', { message: emsg(error) }));
    }

    if (!players.length) {
        return buildDeniedReply(
            'warning',
            translatePlayerLookup('no_players_found', { searchId }),
            'invalid_target',
            false,
        );
    }

    if (players.length > 10) {
        return buildDeniedReply(
            'warning',
            translatePlayerLookup('too_many_players', { searchId }),
            'invalid_target',
            false,
        );
    }

    const formatDate = (ts: number) => {
        return new Date(ts * 1000).toLocaleDateString(txCore.translator.canonical, { dateStyle: 'long' });
    };
    const truncate = (input: string, maxLen = 1000) => {
        return input.length > maxLen ? `${input.substring(0, maxLen)}…` : input;
    };

    const embeds = [] as Record<string, unknown>[];
    for (const player of players) {
        const dbData = player.getDbData();
        if (!dbData) continue;

        const bodyText: Record<string, string> = {
            [translatePlayerLookup('fields.play_time')]: msToShortishDuration(dbData.playTime * 60 * 1000),
            [translatePlayerLookup('fields.join_date')]: formatDate(dbData.tsJoined),
            [translatePlayerLookup('fields.last_connection')]: formatDate(dbData.tsLastConnection),
            [translatePlayerLookup('fields.whitelisted')]: dbData.tsWhitelisted
                ? formatDate(dbData.tsWhitelisted)
                : translatePlayerLookup('values.not_yet'),
        };

        const embed: Record<string, unknown> = {
            title: player.displayName,
            color: infoEmbedColor,
            footer: commandFooter,
        };

        if (adminView) {
            const actionHistory = player.getHistory();
            const actionCount = { ban: 0, warn: 0, kick: 0 };
            for (const entry of actionHistory) {
                if (entry.type in actionCount) {
                    actionCount[entry.type as keyof typeof actionCount]++;
                }
            }

            const banText = translatePlayerLookupActionCount('ban', actionCount.ban);
            const warnText = translatePlayerLookupActionCount('warn', actionCount.warn);
            const kickText = translatePlayerLookupActionCount('kick', actionCount.kick);
            bodyText[translatePlayerLookup('fields.log')] = translatePlayerLookup('log_summary', {
                banText,
                warnText,
                kickText,
            });

            const notesText = dbData.notes ? dbData.notes.text : translatePlayerLookup('values.nothing_here');
            const idsText = dbData.ids.length ? dbData.ids.join('\n') : translatePlayerLookup('values.nothing_here');
            embed.fields = [
                {
                    name: translatePlayerLookup('fields.notes'),
                    value: `\`\`\`${truncate(notesText)}\`\`\``,
                },
                {
                    name: translatePlayerLookup('fields.identifiers'),
                    value: `\`\`\`${truncate(idsText)}\`\`\``,
                },
            ];
        }

        embed.description = Object.entries(bodyText)
            .map(([label, value]) => `**• ${label}:** \`${value}\``)
            .join('\n');
        embeds.push(embed);
    }

    return buildSuccessResponse({ reply: buildDiscordCardMessageFromEmbeds(embeds) });
};
