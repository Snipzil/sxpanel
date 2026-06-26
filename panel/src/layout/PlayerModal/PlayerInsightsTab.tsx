import { useMemo } from 'react';
import { AlertTriangleIcon, ClockIcon, ExternalLinkIcon, ShieldAlertIcon, UserIcon } from 'lucide-react';
import { ClientDateText } from '@/components/ClientDateText';
import { cn, createDuplicateKeyResolver } from '@/lib/utils';
import { PlayerModalPlayerData } from '@shared/playerApiTypes';
import { useLocale } from '@/hooks/locale';

/**
 * Extracts the creation timestamp from a Discord snowflake ID.
 * Discord epoch is 1420070400000 (2015-01-01T00:00:00.000Z).
 */
const getDiscordAccountAge = (ids: string[]) => {
    const discordId = ids.find((id) => id.startsWith('discord:'));
    if (!discordId) return null;
    const snowflake = discordId.split(':')[1];
    const timestamp = Number(BigInt(snowflake) >> 22n) + 1420070400000;
    if (isNaN(timestamp) || timestamp < 1420070400000) return null;
    return new Date(timestamp);
};

/**
 * Converts a FiveM steam hex identifier to a Steam profile URL.
 * Format: steam:1100001XXXXXXXX (hex) -> Steam64 decimal ID
 */
const getSteamProfileUrl = (ids: string[]) => {
    const steamId = ids.find((id) => id.startsWith('steam:'));
    if (!steamId) return null;
    const hexValue = steamId.split(':')[1];
    const steam64 = BigInt(`0x${hexValue}`).toString();
    return `https://steamcommunity.com/profiles/${steam64}`;
};

/**
 * Formats a duration between two dates as a human-readable string.
 */
const formatAge = (from: Date, t: ReturnType<typeof useLocale>['t'], to: Date = new Date()) => {
    const diffMs = to.getTime() - from.getTime();
    if (diffMs < 0) return t('panel.player_modal.insights.unknown_age');
    const days = Math.floor(diffMs / 86_400_000);
    if (days < 1) return t('panel.player_modal.insights.less_than_day');
    if (days < 30)
        return days === 1
            ? t('panel.player_modal.insights.days_one')
            : t('panel.player_modal.insights.days_other', { count: days });
    const months = Math.floor(days / 30);
    if (months < 12) {
        return months === 1
            ? t('panel.player_modal.insights.months_one')
            : t('panel.player_modal.insights.months_other', { count: months });
    }
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (remMonths === 0) {
        return years === 1
            ? t('panel.player_modal.insights.years_one')
            : t('panel.player_modal.insights.years_other', { count: years });
    }
    return t('panel.player_modal.insights.years_months', { years, months: remMonths });
};

/**
 * Detects identifiers that were previously used but are no longer present.
 * oldIds contains ALL historic ids (including current), ids contains current session ids.
 */
const detectIdChanges = (currentIds: string[], allIds?: string[]) => {
    if (!allIds || !allIds.length) return [];
    const currentSet = new Set(currentIds);
    const changes: { type: string; oldId: string }[] = [];
    const trackableTypes = new Set(['discord', 'steam', 'live', 'xbl', 'fivem']);
    for (const id of allIds) {
        if (currentSet.has(id)) continue;
        const [type] = id.split(':');
        if (!trackableTypes.has(type)) continue;
        //Only flag if the player has a current id of the same type
        //i.e. they swapped their discord, not just didn't have one before
        const hasCurrentOfType = currentIds.some((cid) => cid.startsWith(`${type}:`));
        if (hasCurrentOfType) {
            changes.push({ type, oldId: id });
        }
    }
    return changes;
};

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type RiskFactor = {
    level: RiskLevel;
    score: number;
    reasons: string[];
};

/**
 * Computes a risk factor based on action history and account signals.
 */
const computeRiskFactor = (
    player: PlayerModalPlayerData,
    idChanges: { type: string; oldId: string }[],
    discordAge: Date | null,
    t: ReturnType<typeof useLocale>['t'],
): RiskFactor => {
    let score = 0;
    const reasons: string[] = [];
    const history = player.actionHistory;

    //Count active (non-revoked) actions
    const activeBans = history.filter((a) => a.type === 'ban' && !a.revokedAt).length;
    const activeWarns = history.filter((a) => a.type === 'warn' && !a.revokedAt).length;
    const kicks = history.filter((a) => a.type === 'kick').length;

    //Count total (including revoked)
    const totalBans = history.filter((a) => a.type === 'ban').length;
    const totalWarns = history.filter((a) => a.type === 'warn').length;

    if (activeBans > 0) {
        score += activeBans * 30;
        reasons.push(
            activeBans === 1
                ? t('panel.player_modal.insights.risk.active_bans_one')
                : t('panel.player_modal.insights.risk.active_bans_other', { count: activeBans }),
        );
    }
    if (totalBans > activeBans) {
        const revokedBans = totalBans - activeBans;
        score += revokedBans * 10;
        reasons.push(
            revokedBans === 1
                ? t('panel.player_modal.insights.risk.past_bans_one')
                : t('panel.player_modal.insights.risk.past_bans_other', { count: revokedBans }),
        );
    }
    if (activeWarns > 0) {
        score += activeWarns * 10;
        reasons.push(
            activeWarns === 1
                ? t('panel.player_modal.insights.risk.active_warns_one')
                : t('panel.player_modal.insights.risk.active_warns_other', { count: activeWarns }),
        );
    }
    if (totalWarns > activeWarns) {
        const revokedWarns = totalWarns - activeWarns;
        score += revokedWarns * 3;
        reasons.push(
            revokedWarns === 1
                ? t('panel.player_modal.insights.risk.past_warns_one')
                : t('panel.player_modal.insights.risk.past_warns_other', { count: revokedWarns }),
        );
    }
    if (kicks > 0) {
        score += kicks * 5;
        reasons.push(
            kicks === 1
                ? t('panel.player_modal.insights.risk.kicks_one')
                : t('panel.player_modal.insights.risk.kicks_other', { count: kicks }),
        );
    }

    //Identifier changes as risk signal
    if (idChanges.length > 0) {
        score += idChanges.length * 15;
        reasons.push(
            idChanges.length === 1
                ? t('panel.player_modal.insights.risk.id_changes_one')
                : t('panel.player_modal.insights.risk.id_changes_other', { count: idChanges.length }),
        );
    }

    //New Discord account
    if (discordAge) {
        const ageMs = Date.now() - discordAge.getTime();
        const ageDays = ageMs / 86_400_000;
        if (ageDays < 30) {
            score += 20;
            reasons.push(t('panel.player_modal.insights.risk.discord_under_30'));
        } else if (ageDays < 90) {
            score += 10;
            reasons.push(t('panel.player_modal.insights.risk.discord_under_90'));
        }
    }

    //Low playtime + actions = suspicious
    if (player.playTime !== undefined && player.playTime < 60 && activeBans + activeWarns > 0) {
        score += 10;
        reasons.push(t('panel.player_modal.insights.risk.low_playtime_sanctions'));
    }

    let level: RiskLevel;
    if (score >= 50) level = 'critical';
    else if (score >= 30) level = 'high';
    else if (score >= 15) level = 'medium';
    else level = 'low';

    return { level, score, reasons };
};

const riskColors: Record<RiskLevel, string> = {
    low: 'text-green-500',
    medium: 'text-warning',
    high: 'text-orange-500',
    critical: 'text-destructive',
};
const riskBgColors: Record<RiskLevel, string> = {
    low: 'bg-green-500/10 border-green-500/20',
    medium: 'bg-warning/10 border-warning/20',
    high: 'bg-orange-500/10 border-orange-500/20',
    critical: 'bg-destructive/10 border-destructive/20',
};

type PlayerInsightsTabProps = {
    player: PlayerModalPlayerData;
    serverTime: number;
};

export default function PlayerInsightsTab({ player, serverTime }: PlayerInsightsTabProps) {
    const { t } = useLocale();
    const discordAge = useMemo(() => getDiscordAccountAge(player.ids), [player.ids]);
    const steamProfileUrl = useMemo(() => getSteamProfileUrl(player.ids), [player.ids]);
    const idChanges = useMemo(() => detectIdChanges(player.ids, player.oldIds), [player.ids, player.oldIds]);
    const risk = useMemo(() => computeRiskFactor(player, idChanges, discordAge, t), [player, idChanges, discordAge, t]);
    const getRiskReasonKey = createDuplicateKeyResolver();
    const getIdChangeKey = createDuplicateKeyResolver();
    const getNameHistoryKey = createDuplicateKeyResolver();

    if (!player.isRegistered) {
        return (
            <div className="text-muted-foreground flex items-center justify-center py-8 text-sm">
                {t('panel.player_modal.insights.not_registered')}
            </div>
        );
    }

    return (
        <div className="space-y-4 p-1">
            {/* Risk Factor */}
            <div className={cn('rounded-lg border p-3', riskBgColors[risk.level])}>
                <div className="mb-2 flex items-center gap-2">
                    <ShieldAlertIcon className={cn('size-5', riskColors[risk.level])} />
                    <span className="font-medium">{t('panel.player_modal.insights.risk_assessment')}</span>
                    <span className={cn('ml-auto text-sm font-bold uppercase', riskColors[risk.level])}>
                        {risk.level}
                    </span>
                </div>
                {risk.reasons.length > 0 ? (
                    <ul className="text-muted-foreground ml-7 space-y-0.5 text-sm">
                        {risk.reasons.map((reason) => (
                            <li key={getRiskReasonKey(reason)} className="list-disc">
                                {reason}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-muted-foreground ml-7 text-sm">
                        {t('panel.player_modal.insights.no_risk_signals')}
                    </p>
                )}
            </div>

            {/* Account Ages */}
            <div>
                <h4 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
                    <ClockIcon className="size-4" /> {t('panel.player_modal.insights.account_ages')}
                </h4>
                <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/50 rounded-md p-2.5 text-sm">
                        <span className="text-muted-foreground">{t('panel.player_modal.insights.discord')}</span>
                        <div className="font-medium">
                            {discordAge ? formatAge(discordAge, t) : t('panel.player_modal.insights.na')}
                        </div>
                        {discordAge && (
                            <div className="text-muted-foreground text-xs">
                                {t('panel.player_modal.insights.created', {
                                    date: discordAge.toLocaleDateString(),
                                })}
                            </div>
                        )}
                    </div>
                    <div className="bg-muted/50 rounded-md p-2.5 text-sm">
                        <span className="text-muted-foreground">{t('panel.player_modal.insights.steam')}</span>
                        <div className="font-medium">
                            {steamProfileUrl ? (
                                <a
                                    href={steamProfileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent inline-flex items-center gap-1 hover:underline"
                                >
                                    {t('panel.player_modal.insights.profile')} <ExternalLinkIcon className="size-3" />
                                </a>
                            ) : (
                                t('panel.player_modal.insights.na')
                            )}
                        </div>
                    </div>
                    <div className="bg-muted/50 rounded-md p-2.5 text-sm">
                        <span className="text-muted-foreground">{t('panel.player_modal.insights.server')}</span>
                        <ClientDateText
                            as="div"
                            className="font-medium"
                            timestamp={player.tsJoined ? player.tsJoined * 1000 : null}
                            formatter={(date) => formatAge(date, t)}
                            fallback={t('panel.player_modal.insights.na')}
                        />
                        {player.tsJoined && (
                            <div className="text-muted-foreground text-xs">
                                <ClientDateText
                                    timestamp={player.tsJoined * 1000}
                                    formatter={(date) =>
                                        t('panel.player_modal.insights.joined', {
                                            date: date.toLocaleDateString(),
                                        })
                                    }
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Identifier Changes */}
            {idChanges.length > 0 && (
                <div>
                    <h4 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <AlertTriangleIcon className="text-warning size-4" />{' '}
                        {t('panel.player_modal.insights.identifier_changes')}
                    </h4>
                    <div className="space-y-1">
                        {idChanges.map((change) => (
                            <div
                                key={getIdChangeKey(`${change.type}:${change.oldId}`)}
                                className="bg-warning/5 border-warning/20 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                            >
                                <span className="text-warning font-mono text-xs">{change.type}</span>
                                <span className="text-muted-foreground truncate font-mono text-xs">{change.oldId}</span>
                                <span className="text-warning ml-auto shrink-0 text-xs">
                                    {t('panel.player_modal.insights.changed')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Name History */}
            {player.nameHistory && player.nameHistory.length > 1 && (
                <div>
                    <h4 className="text-muted-foreground mb-2 flex items-center gap-1.5 text-sm font-medium">
                        <UserIcon className="size-4" /> {t('panel.player_modal.insights.name_history')}
                        <span className="text-xs">
                            {t('panel.player_modal.insights.names_count', {
                                count: player.nameHistory.length,
                            })}
                        </span>
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                        {player.nameHistory.map((name, i) => (
                            <span
                                key={getNameHistoryKey(name)}
                                className={cn(
                                    'rounded-md border px-2 py-0.5 text-sm',
                                    i === player.nameHistory!.length - 1
                                        ? 'bg-primary/10 border-primary/30 font-medium'
                                        : 'bg-muted/50 border-muted text-muted-foreground',
                                )}
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
