import { useReducer } from 'react';
import { useBackendApi, ApiTimeout } from '@/hooks/fetch';
import { useAdminPerms, useCsrfToken } from '@/hooks/auth';
import { useLocale } from '@/hooks/locale';
import { txToast } from '@/components/TxToaster';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import { createDuplicateKeyResolver, submitAuthedDownload } from '@/lib/utils';
import { TelemetryOptOutCard } from './TelemetryOptOutCard';
import type { SettingsPageContext } from './utils';

type CleanDbResp = {
    msElapsed?: number;
    playersRemoved?: number;
    actionsRemoved?: number;
    hwidsRemoved?: number;
    error?: string;
};

type RevokeWlResp = {
    msElapsed?: number;
    cntRemoved?: number;
    error?: string;
};

type DangerZoneState = {
    isCleaningDb: boolean;
    isRevokingWl: boolean;
    players: string;
    bans: string;
    warns: string;
    hwids: string;
    wlFilter: string;
};

const reduceDangerZoneState = (state: DangerZoneState, action: Partial<DangerZoneState>) => {
    return {
        ...state,
        ...action,
    };
};

const SELECT_CLASS = 'bg-secondary text-secondary-foreground w-full rounded-md border px-3 py-2 text-sm';

function DangerZoneAccessWarnings({
    isMasterAdmin,
    isWebInterface,
    t,
}: {
    isMasterAdmin: boolean;
    isWebInterface: boolean;
    t: ReturnType<typeof useLocale>['t'];
}) {
    return (
        <>
            {!isMasterAdmin && (
                <div className="border-warning/30 bg-warning-hint rounded-lg border p-4 text-center text-sm">
                    <strong>{t('panel.settings.danger_zone.warning_label')}</strong>{' '}
                    {t('panel.settings.danger_zone.master_admin_warning')}
                </div>
            )}
            {!isWebInterface && (
                <div className="border-warning/30 bg-warning-hint rounded-lg border p-4 text-center text-sm">
                    <strong>{t('panel.settings.danger_zone.warning_label')}</strong>{' '}
                    {t('panel.settings.danger_zone.web_only_warning')}
                </div>
            )}
        </>
    );
}

function BackupDatabaseCard({ disabled, t }: { disabled: boolean; t: ReturnType<typeof useLocale>['t'] }) {
    const csrfToken = useCsrfToken();

    return (
        <div className="border-border/60 bg-card rounded-xl border">
            <div className="border-border/40 border-b px-5 py-3">
                <h3 className="font-semibold">{t('panel.settings.danger_zone.backup_title')}</h3>
                <p className="text-muted-foreground text-sm">
                    {t('panel.settings.danger_zone.backup_desc')} <code className="text-xs">playersDB.json</code>
                </p>
            </div>
            <div className="flex items-center justify-end px-5 py-4">
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled || !csrfToken}
                    onClick={() => {
                        submitAuthedDownload('/masterActions/backupDatabase', csrfToken);
                    }}
                >
                    {t('panel.settings.danger_zone.backup_button')}
                </Button>
            </div>
        </div>
    );
}

export default function DangerZoneTab({ pageCtx }: { pageCtx?: SettingsPageContext }) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const isMasterAdmin = hasPerm('master');
    const isWebInterface = window.txConsts.isWebInterface;
    const disableActions = !(isMasterAdmin && isWebInterface);
    const openConfirmDialog = useOpenConfirmDialog();
    const getChangeKey = createDuplicateKeyResolver();
    const [state, dispatch] = useReducer(reduceDangerZoneState, {
        isCleaningDb: false,
        isRevokingWl: false,
        players: 'none',
        bans: 'none',
        warns: 'none',
        hwids: 'none',
        wlFilter: '30d',
    });
    const { isCleaningDb, isRevokingWl, players, bans, warns, hwids, wlFilter } = state;

    const cleanDbApi = useBackendApi<CleanDbResp>({
        method: 'POST',
        path: '/masterActions/cleanDatabase',
    });
    const revokeWlApi = useBackendApi<RevokeWlResp>({
        method: 'POST',
        path: '/masterActions/revokeWhitelists',
    });

    const filterLabel = (group: 'players' | 'bans' | 'warns' | 'hwids', value: string) => {
        if (value === 'none') return t('panel.common.none');
        if (group === 'bans' && value === 'revokedExpired') {
            return t('panel.settings.danger_zone.bans_revoked_expired');
        }
        return t(`panel.settings.danger_zone.${group}_${value}`);
    };

    const handleCleanDb = () => {
        const changes: string[] = [];
        if (players !== 'none') {
            changes.push(
                t('panel.settings.danger_zone.change_remove_players', {
                    filter: filterLabel('players', players),
                }),
            );
        }
        if (bans !== 'none') {
            changes.push(t('panel.settings.danger_zone.change_remove_bans', { filter: filterLabel('bans', bans) }));
        }
        if (warns !== 'none') {
            changes.push(t('panel.settings.danger_zone.change_remove_warns', { filter: filterLabel('warns', warns) }));
        }
        if (hwids !== 'none') {
            changes.push(t('panel.settings.danger_zone.change_remove_hwids', { filter: filterLabel('hwids', hwids) }));
        }

        if (!changes.length) {
            txToast.warning(t('panel.settings.danger_zone.select_one_option'));
            return;
        }

        openConfirmDialog({
            title: t('panel.settings.danger_zone.confirm_title'),
            message: (
                <ul className="mt-2 list-inside list-disc space-y-1">
                    {changes.map((change) => (
                        <li key={getChangeKey(change)}>{change}</li>
                    ))}
                </ul>
            ),
            actionLabel: t('panel.settings.danger_zone.clean_button'),
            onConfirm: () => {
                dispatch({ isCleaningDb: true });
                cleanDbApi({
                    data: { players, bans, warns, hwids },
                    timeout: ApiTimeout.LONG,
                    success(d) {
                        dispatch({ isCleaningDb: false });
                        if (d.error) {
                            txToast.error(d.error);
                        } else {
                            txToast.success(
                                t('panel.settings.danger_zone.clean_success', {
                                    players: d.playersRemoved ?? 0,
                                    actions: d.actionsRemoved ?? 0,
                                    hwids: d.hwidsRemoved ?? 0,
                                    ms: d.msElapsed ?? 0,
                                }),
                            );
                        }
                    },
                    error(msg) {
                        dispatch({ isCleaningDb: false });
                        txToast.error(msg);
                    },
                });
            },
        });
    };

    const handleRevokeWl = () => {
        const wlFilterText =
            wlFilter === 'all'
                ? t('panel.settings.danger_zone.wl_filter_all')
                : t(`panel.settings.danger_zone.wl_filter_${wlFilter}`);
        const actionText =
            wlFilter === 'all'
                ? t('panel.settings.danger_zone.revoke_all')
                : t('panel.settings.danger_zone.revoke_inactive', { filter: wlFilterText });

        openConfirmDialog({
            title: t('panel.settings.danger_zone.confirm_title'),
            message: actionText,
            actionLabel: t('panel.settings.danger_zone.revoke_button'),
            onConfirm: () => {
                dispatch({ isRevokingWl: true });
                revokeWlApi({
                    data: { filter: wlFilter },
                    timeout: ApiTimeout.LONG,
                    success(d) {
                        dispatch({ isRevokingWl: false });
                        if (d.error) {
                            txToast.error(d.error);
                        } else {
                            txToast.success(
                                t('panel.settings.danger_zone.revoke_success', {
                                    count: d.cntRemoved ?? 0,
                                    ms: d.msElapsed ?? 0,
                                }),
                            );
                        }
                    },
                    error(msg) {
                        dispatch({ isRevokingWl: false });
                        txToast.error(msg);
                    },
                });
            },
        });
    };

    return (
        <div className="space-y-6">
            <DangerZoneAccessWarnings isMasterAdmin={isMasterAdmin} isWebInterface={isWebInterface} t={t} />
            <BackupDatabaseCard disabled={disableActions} t={t} />

            <div className="border-destructive/30 bg-card rounded-xl border">
                <div className="border-border/40 border-b px-5 py-3">
                    <h3 className="font-semibold">{t('panel.settings.danger_zone.revoke_title')}</h3>
                    <p className="text-muted-foreground text-sm">{t('panel.settings.danger_zone.revoke_desc')}</p>
                </div>
                <div className="space-y-4 p-5">
                    <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                        <label htmlFor="wl-filter-select" className="pt-2 text-sm font-medium">
                            {t('panel.settings.danger_zone.filter_label')}
                        </label>
                        <div>
                            <select
                                id="wl-filter-select"
                                className={SELECT_CLASS}
                                value={wlFilter}
                                onChange={(e) => dispatch({ wlFilter: e.target.value })}
                            >
                                <option value="30d">{t('panel.settings.danger_zone.wl_filter_30d')}</option>
                                <option value="15d">{t('panel.settings.danger_zone.wl_filter_15d')}</option>
                                <option value="7d">{t('panel.settings.danger_zone.wl_filter_7d')}</option>
                                <option value="all">{t('panel.settings.danger_zone.wl_filter_all')}</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={disableActions || isRevokingWl}
                            onClick={handleRevokeWl}
                        >
                            {isRevokingWl && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                            {t('panel.settings.danger_zone.revoke_button')}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="border-destructive/30 bg-card rounded-xl border">
                <div className="border-border/40 border-b px-5 py-3">
                    <h3 className="font-semibold">{t('panel.settings.danger_zone.clean_title')}</h3>
                    <p className="text-muted-foreground text-sm">
                        {t('panel.settings.danger_zone.clean_desc_prefix')}{' '}
                        <strong>{t('panel.settings.danger_zone.clean_desc_irreversible')}</strong>
                        {t('panel.settings.danger_zone.clean_desc_suffix')}
                    </p>
                </div>
                <div className="space-y-4 p-5">
                    <div className="border-warning/30 bg-warning-hint rounded-lg border p-3 text-center text-sm">
                        <strong>{t('panel.settings.danger_zone.warning_label')}</strong>{' '}
                        {t('panel.settings.danger_zone.clean_irreversible_warning')}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                        <label htmlFor="clean-db-players-select" className="pt-2 text-sm font-medium">
                            {t('panel.settings.danger_zone.players_label')}
                        </label>
                        <div>
                            <select
                                id="clean-db-players-select"
                                className={SELECT_CLASS}
                                value={players}
                                onChange={(e) => dispatch({ players: e.target.value })}
                            >
                                <option value="none">{t('panel.settings.danger_zone.players_none')}</option>
                                <option value="60d">{t('panel.settings.danger_zone.players_60d')}</option>
                                <option value="30d">{t('panel.settings.danger_zone.players_30d')}</option>
                                <option value="15d">{t('panel.settings.danger_zone.players_15d')}</option>
                            </select>
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('panel.settings.danger_zone.players_help')}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                        <label htmlFor="clean-db-bans-select" className="pt-2 text-sm font-medium">
                            {t('panel.settings.danger_zone.bans_label')}
                        </label>
                        <div>
                            <select
                                id="clean-db-bans-select"
                                className={SELECT_CLASS}
                                value={bans}
                                onChange={(e) => dispatch({ bans: e.target.value })}
                            >
                                <option value="none">{t('panel.settings.danger_zone.bans_none')}</option>
                                <option value="revoked">{t('panel.settings.danger_zone.bans_revoked')}</option>
                                <option value="revokedExpired">
                                    {t('panel.settings.danger_zone.bans_revoked_expired')}
                                </option>
                                <option value="all">{t('panel.settings.danger_zone.bans_all')}</option>
                            </select>
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('panel.settings.danger_zone.bans_help')}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                        <label htmlFor="clean-db-warns-select" className="pt-2 text-sm font-medium">
                            {t('panel.settings.danger_zone.warns_label')}
                        </label>
                        <div>
                            <select
                                id="clean-db-warns-select"
                                className={SELECT_CLASS}
                                value={warns}
                                onChange={(e) => dispatch({ warns: e.target.value })}
                            >
                                <option value="none">{t('panel.settings.danger_zone.warns_none')}</option>
                                <option value="revoked">{t('panel.settings.danger_zone.warns_revoked')}</option>
                                <option value="30d">{t('panel.settings.danger_zone.warns_30d')}</option>
                                <option value="15d">{t('panel.settings.danger_zone.warns_15d')}</option>
                                <option value="7d">{t('panel.settings.danger_zone.warns_7d')}</option>
                                <option value="all">{t('panel.settings.danger_zone.warns_all')}</option>
                            </select>
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('panel.settings.danger_zone.warns_help')}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                        <label htmlFor="clean-db-hwids-select" className="pt-2 text-sm font-medium">
                            {t('panel.settings.danger_zone.hwids_label')}
                        </label>
                        <div>
                            <select
                                id="clean-db-hwids-select"
                                className={SELECT_CLASS}
                                value={hwids}
                                onChange={(e) => dispatch({ hwids: e.target.value })}
                            >
                                <option value="none">{t('panel.settings.danger_zone.hwids_none')}</option>
                                <option value="players">{t('panel.settings.danger_zone.hwids_players')}</option>
                                <option value="bans">{t('panel.settings.danger_zone.hwids_bans')}</option>
                                <option value="all">{t('panel.settings.danger_zone.hwids_all')}</option>
                            </select>
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('panel.settings.danger_zone.hwids_help_prefix')}{' '}
                                <code className="text-xs">sv_licenseKey</code>
                                {t('panel.settings.danger_zone.hwids_help_suffix')}
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="destructive"
                            size="sm"
                            disabled={disableActions || isCleaningDb}
                            onClick={handleCleanDb}
                        >
                            {isCleaningDb && <Loader2Icon className="mr-2 size-4 animate-spin" />}
                            {t('panel.settings.danger_zone.clean_button')}
                        </Button>
                    </div>
                </div>
            </div>

            {pageCtx ? <TelemetryOptOutCard pageCtx={pageCtx} disabled={disableActions} t={t} /> : null}
        </div>
    );
}
