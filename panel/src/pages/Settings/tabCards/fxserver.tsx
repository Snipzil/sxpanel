import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SwitchText from '@/components/SwitchText';
import InlineCode from '@/components/InlineCode';
import { AdvancedDivider, SettingItem, SettingItemDesc } from '../settingsItems';
import { useState, useEffect, useLayoutEffect, useRef, useMemo, useReducer } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
    reconcileCardPendingSave,
    type PageConfigReducerAction,
} from '../utils';
import { PlusIcon, TrashIcon, Undo2Icon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TimeInputDialog } from '@/components/TimeInputDialog';
import cleanFullPath from '@shared/cleanFullPath';
import TxAnchor from '@/components/TxAnchor';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import SettingsCardShell from '../SettingsCardShell';
import { cn } from '@/lib/utils';
import { txToast } from '@/components/TxToaster';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { useLocation } from 'wouter';
import type { ResetServerDataPathResp } from '@shared/otherTypes';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { Separator } from '@/components/ui/separator';
import { useLocale } from '@/hooks/locale';

// Remove duplicates and sort times
function sanitizeTimes(times: string[]): string[] {
    const uniqueTimes = Array.from(new Set(times));
    return uniqueTimes.sort((a, b) => {
        const [aHours, aMinutes] = a.split(':').map(Number);
        const [bHours, bMinutes] = b.split(':').map(Number);
        return aHours - bHours || aMinutes - bMinutes;
    });
}

type RestartScheduleBoxProps = {
    restartTimes: string[] | undefined;
    setRestartTimes: (val: PageConfigReducerAction<string[] | undefined>['configValue']) => void;
    disabled?: boolean;
};

function RestartScheduleBox({ restartTimes, setRestartTimes, disabled }: RestartScheduleBoxProps) {
    const { t } = useLocale();
    const [isTimeInputOpen, setIsTimeInputOpen] = useState(false);
    const [animationParent] = useAutoAnimate();

    const addTime = (time: string) => {
        if (!restartTimes || disabled) return;
        setRestartTimes((prev) => sanitizeTimes([...(prev ?? []), time]));
    };
    const removeTime = (index: number) => {
        if (!restartTimes || disabled) return;
        setRestartTimes((prev) => sanitizeTimes((prev ?? []).filter((_, i) => i !== index)));
    };
    const applyPreset = (presetTimes: string[]) => {
        if (!restartTimes || disabled) return;
        setRestartTimes(presetTimes);
    };
    const clearTimes = () => {
        if (disabled) return;
        setRestartTimes([]);
    };

    const presetSpanClasses = cn('text-muted-foreground', disabled && 'opacity-50 cursor-not-allowed');

    return (
        <div className="flex min-h-18 items-center rounded-lg border px-2 py-3">
            <div className={cn('flex w-full items-center gap-2', disabled && 'cursor-not-allowed')}>
                <div className="flex grow flex-wrap gap-2" ref={animationParent}>
                    {restartTimes && restartTimes.length === 0 && (
                        <div className="text-muted-foreground text-sm">
                            <span>{t('panel.settings.fxserver.restart_schedule_empty')}</span>
                            <p>
                                {t('panel.settings.fxserver.restart_schedule_presets')}{' '}
                                <button
                                    type="button"
                                    onClick={() => applyPreset(['00:00'])}
                                    className="text-primary inline cursor-pointer bg-transparent p-0 text-sm hover:underline"
                                >
                                    1x
                                    <span className={presetSpanClasses}>
                                        {t('panel.settings.fxserver.restart_schedule_preset_1x')}
                                    </span>
                                </button>
                                {', '}
                                <button
                                    type="button"
                                    onClick={() => applyPreset(['00:00', '12:00'])}
                                    className="text-primary inline cursor-pointer bg-transparent p-0 text-sm hover:underline"
                                >
                                    2x
                                    <span className={presetSpanClasses}>
                                        {t('panel.settings.fxserver.restart_schedule_preset_2x')}
                                    </span>
                                </button>
                                {', '}
                                <button
                                    type="button"
                                    onClick={() => applyPreset(['00:00', '08:00', '16:00'])}
                                    className="text-primary inline cursor-pointer bg-transparent p-0 text-sm hover:underline"
                                >
                                    3x
                                    <span className={presetSpanClasses}>
                                        {t('panel.settings.fxserver.restart_schedule_preset_3x')}
                                    </span>
                                </button>
                                {', '}
                                <button
                                    type="button"
                                    onClick={() => applyPreset(['00:00', '06:00', '12:00', '18:00'])}
                                    className="text-primary inline cursor-pointer bg-transparent p-0 text-sm hover:underline"
                                >
                                    4x
                                    <span className={presetSpanClasses}>
                                        {t('panel.settings.fxserver.restart_schedule_preset_4x')}
                                    </span>
                                </button>
                            </p>
                        </div>
                    )}
                    {restartTimes &&
                        restartTimes.map((time, index) => (
                            <div
                                key={time}
                                className="bg-secondary text-secondary-foreground flex items-center gap-x-1 rounded-md px-3 py-1 select-none"
                            >
                                <span className="font-mono">{time}</span>
                                {!disabled && (
                                    <button
                                        onClick={() => removeTime(index)}
                                        className="text-secondary-foreground/50 hover:text-destructive ml-2"
                                        aria-label={t('panel.settings.fxserver.restart_schedule_remove_aria')}
                                        disabled={disabled}
                                    >
                                        <XIcon className="size-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={() => setIsTimeInputOpen(true)}
                        variant="secondary"
                        size={'xs'}
                        className="hover:bg-primary hover:text-primary-foreground w-10"
                        aria-label={t('panel.settings.fxserver.restart_schedule_add_aria')}
                        disabled={disabled}
                    >
                        <PlusIcon className="h-4" />
                    </Button>
                    <Button
                        onClick={() => clearTimes()}
                        variant="muted"
                        size={'xs'}
                        className="hover:bg-destructive hover:text-destructive-foreground w-10"
                        aria-label={t('panel.settings.fxserver.restart_schedule_clear_aria')}
                        disabled={disabled || !restartTimes || restartTimes.length === 0}
                    >
                        <TrashIcon className="h-3.5" />
                    </Button>
                </div>
            </div>
            <TimeInputDialog
                title={t('panel.settings.fxserver.restart_schedule_add_time')}
                isOpen={isTimeInputOpen}
                onClose={() => setIsTimeInputOpen(false)}
                onSubmit={addTime}
            />
        </div>
    );
}

const getServerDataPlaceholder = (hostSuggested?: string) => {
    if (hostSuggested) {
        const withoutTailSlash = hostSuggested.replace(/\/$/, '');
        return `${withoutTailSlash}/CFXDefault`;
    } else if (window.txConsts.isWindows) {
        return 'C:/Users/Admin/Desktop/CFXDefault';
    } else {
        return '/root/fivem/txData/CFXDefault';
    }
};

// Check if the browser timezone is different from the server timezone
function TimeZoneWarning() {
    const { t } = useLocale();
    try {
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (window.txConsts.serverTimezone !== browserTimezone) {
            return (
                <SettingItemDesc className="text-destructive-inline">
                    <strong>{t('panel.settings.fxserver.warning_label')}</strong>{' '}
                    {t('panel.settings.fxserver.timezone_warning', {
                        serverTz: window.txConsts.serverTimezone,
                        browserTz: browserTimezone,
                    })}
                </SettingItemDesc>
            );
        }
    } catch (error) {
        console.error(error);
    }
    return null;
}

const RETENTION_PRESETS = ['3', '7', '14', '30', '60', '90'];

const pageConfigs = {
    dataPath: getPageConfig('server', 'dataPath'),
    restarterSchedule: getPageConfig('restarter', 'schedule'),
    restarterIntervalHours: getPageConfig('restarter', 'intervalHours'),
    quietMode: getPageConfig('server', 'quiet', undefined, false),
    serverLogRetention: getPageConfig('logger', 'serverLogRetention'),
    hideFxsUpdateNotification: getPageConfig('general', 'hideFxsUpdateNotification', undefined, false),

    cfgPath: getPageConfig('server', 'cfgPath', true),
    startupArgs: getPageConfig('server', 'startupArgs', true),
    onesync: getPageConfig('server', 'onesync', true),
    autoStart: getPageConfig('server', 'autoStart', true, true),
    resourceTolerance: getPageConfig('restarter', 'resourceStartingTolerance', true),
    disableHealthCheck: getPageConfig('restarter', 'disableHealthCheck', true, false),
    httpPlayerlistHost: getPageConfig('restarter', 'httpPlayerlistHost', true, ''),
} as const;

function useConfigCardFxserver({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isResettingServerData, setIsResettingServerData] = useState(false);
    const { hasPerm } = useAdminPerms();
    const setLocation = useLocation()[1];
    const openConfirmDialog = useOpenConfirmDialog();
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const [customRetentionMode, setCustomRetentionMode] = useState(
        () => !RETENTION_PRESETS.includes(String(states.serverLogRetention)),
    );

    //Effects - handle changes and reset advanced settings

    // Sync uncontrolled ref inputs when apiData loads (defaultValue doesn't update after mount)
    // Also reset the "user has edited" flags so the diff won't see stale DOM values
    const dataPathEdited = useRef(false);
    const cfgPathEdited = useRef(false);
    const startupArgsEdited = useRef(false);
    useLayoutEffect(() => {
        if (!pageCtx.apiData) return;
        if (dataPathRef.current) dataPathRef.current.value = cfg.dataPath.initialValue ?? '';
        if (cfgPathRef.current) cfgPathRef.current.value = cfg.cfgPath.initialValue ?? '';
        if (startupArgsRef.current) startupArgsRef.current.value = inputArrayUtil.toUi(cfg.startupArgs.initialValue);
        dataPathEdited.current = false;
        cfgPathEdited.current = false;
        startupArgsEdited.current = false;
    }, [pageCtx.apiData, cfg]);

    useEffect(() => {
        updatePageState();
    }, [states]);
    useEffect(() => {
        if (showAdvanced) return;
        Object.values(cfg).forEach((c) => c.isAdvanced && c.state.discard());
    }, [showAdvanced, cfg]);

    //Refs for configs that don't use state
    const dataPathRef = useRef<HTMLInputElement | null>(null);
    const cfgPathRef = useRef<HTMLInputElement | null>(null);
    const startupArgsRef = useRef<HTMLInputElement | null>(null);
    const forceQuietMode = pageCtx.apiData?.forceQuietMode;

    //Marshalling Utils
    const selectNumberUtil = {
        toUi: (num?: number) => (num !== undefined && num !== null ? num.toString() : undefined),
        toCfg: (str?: string) => (str !== undefined && str !== '' ? parseInt(str, 10) : undefined),
    };
    const inputArrayUtil = {
        toUi: (args?: string[]) => (args ? args.join(' ') : ''),
        toCfg: (str?: string) => (str ? str.trim().split(/\s+/) : []),
    };
    const emptyToNull = (str?: string) => {
        if (str === undefined) return undefined;
        const trimmed = str.trim();
        return trimmed.length ? trimmed : null;
    };

    //Processes the state of the page and sets the card as pending save if needed
    const updatePageState = () => {
        // Only include ref-based inputs in overwrites if the user has actually edited them.
        // Before that, getConfigDiff falls back to states[configName] which equals initialValue,
        // so hasChanged() returns false and no spurious dirty state is produced.
        const overwrites: Record<string, any> = {};

        if (startupArgsEdited.current && startupArgsRef.current) {
            overwrites.startupArgs = inputArrayUtil.toCfg(startupArgsRef.current.value);
        }

        if (dataPathEdited.current) {
            let currDataPath = emptyToNull(dataPathRef.current?.value);
            if (currDataPath) {
                const result = cleanFullPath(currDataPath, window.txConsts.isWindows);
                currDataPath = 'path' in result ? result.path : currDataPath;
            }
            overwrites.dataPath = currDataPath;
        }

        if (cfgPathEdited.current) {
            let currCfgPath = emptyToNull(cfgPathRef.current?.value);
            if (currCfgPath) {
                const result = cleanFullPath(currCfgPath, window.txConsts.isWindows);
                currCfgPath = 'path' in result ? result.path : currCfgPath;
            }
            overwrites.cfgPath = currCfgPath;
        }

        const res = getConfigDiff(cfg, states, overwrites, showAdvanced);
        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, res.hasChanges));
        return res;
    };

    //Validate changes (for UX only) and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        if (!localConfigs.server?.dataPath) {
            return txToast.error({
                title: t('panel.settings.fxserver.toast_data_path_required_title'),
                md: true,
                msg: t('panel.settings.fxserver.toast_data_path_required_msg'),
            });
        }
        if (localConfigs.server.cfgPath !== undefined && !localConfigs.server.cfgPath) {
            return txToast.error({
                title: t('panel.settings.fxserver.toast_cfg_path_required_title'),
                md: true,
                msg: t('panel.settings.fxserver.toast_cfg_path_required_msg'),
            });
        }
        if (
            Array.isArray(localConfigs.server?.startupArgs) &&
            localConfigs.server.startupArgs.some((arg: string) => arg.toLowerCase() === 'onesync')
        ) {
            return txToast.error({
                title: t('panel.settings.fxserver.toast_onesync_args_title'),
                md: true,
                msg: t('panel.settings.fxserver.toast_onesync_args_msg'),
            });
        }
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    //Card content stuff
    const serverDataPlaceholder = useMemo(() => getServerDataPlaceholder(pageCtx.apiData?.dataPath), [pageCtx.apiData]);

    //Reset server server data button
    const resetServerDataApi = useBackendApi<ResetServerDataPathResp>({
        method: 'POST',
        path: `/settings/resetServerDataPath`,
        throwGenericErrors: true,
    });
    const handleResetServerData = () => {
        openConfirmDialog({
            title: t('panel.settings.fxserver.reset_dialog_title'),
            message: (
                <>
                    {t('panel.settings.fxserver.reset_dialog_confirm')} <br />
                    <br />
                    <strong>{t('panel.settings.fxserver.reset_dialog_no_delete')}</strong> <br />
                    {t('panel.settings.fxserver.reset_dialog_restore')} <br />
                    <br />
                    <strong className="text-warning-inline">{t('panel.settings.fxserver.warning_label')}</strong>{' '}
                    {t('panel.settings.fxserver.reset_dialog_warning')}
                    <Input value={cfg.dataPath.initialValue} className="mt-2" readOnly />
                </>
            ),
            onConfirm: () => {
                setIsResettingServerData(true);
                resetServerDataApi({
                    toastLoadingMessage: t('panel.settings.fxserver.reset_loading'),
                    success: (data, toastId) => {
                        if (data.type === 'success') {
                            setLocation('/server/setup');
                        }
                    },
                    finally: () => setIsResettingServerData(false),
                });
            },
        });
    };

    // cfg.restarterSchedule.state.set(['00:00', '12:00'])
    // cfg.restarterSchedule.state.set([])
    // cfg.restarterSchedule.state.set(undefined)

    const handleOneSyncChange = (val: string) => cfg.onesync.state.set(val as 'on' | 'legacy' | 'off');

    return (
        <SettingsCardShell
            cardCtx={cardCtx}
            pageCtx={pageCtx}
            onClickSave={handleOnSave}
            advancedVisible={showAdvanced}
            advancedSetter={setShowAdvanced}
        >
            <SettingItem label={t('panel.settings.fxserver.data_folder_label')} htmlFor={cfg.dataPath.eid} required>
                <div className="flex gap-2">
                    <Input
                        id={cfg.dataPath.eid}
                        ref={dataPathRef}
                        defaultValue={cfg.dataPath.initialValue}
                        placeholder={serverDataPlaceholder}
                        onInput={() => {
                            dataPathEdited.current = true;
                            updatePageState();
                        }}
                        disabled={pageCtx.isReadOnly}
                        required
                    />
                    <Button
                        className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground grow"
                        variant="outline"
                        disabled={pageCtx.isReadOnly || !hasPerm('all_permissions') || isResettingServerData}
                        onClick={handleResetServerData}
                    >
                        <Undo2Icon className="mr-2 size-4" /> {t('panel.settings.fxserver.reset_button')}
                    </Button>
                </div>
                <SettingItemDesc>
                    {t('panel.settings.fxserver.data_folder_desc')} <br />
                    {t('panel.settings.fxserver.data_folder_reset_note')}
                    {pageCtx.apiData?.dataPath && pageCtx.apiData?.hasCustomDataPath && (
                        <>
                            <br />
                            <span className="text-warning-inline">
                                {window.txConsts.hostConfigSource}:{' '}
                                {t('panel.settings.fxserver.data_folder_host_prefix')}{' '}
                                <InlineCode>{pageCtx.apiData.dataPath}</InlineCode> .
                            </span>
                        </>
                    )}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.fxserver.restart_schedule_label')} showOptional>
                <RestartScheduleBox
                    restartTimes={states.restarterSchedule}
                    setRestartTimes={cfg.restarterSchedule.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <TimeZoneWarning />
                <SettingItemDesc>
                    {t('panel.settings.fxserver.restart_schedule_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.fxserver.restart_schedule_note')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.fxserver.restart_interval_label')} showOptional>
                <div className="flex items-center gap-2">
                    <Input
                        id={cfg.restarterIntervalHours.eid}
                        type="number"
                        min={0}
                        className="w-32"
                        value={states.restarterIntervalHours ?? 0}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10);
                            cfg.restarterIntervalHours.state.set(isNaN(parsed) ? 0 : Math.max(0, parsed));
                        }}
                        disabled={pageCtx.isReadOnly}
                    />
                    <span className="text-muted-foreground text-sm">
                        {t('panel.settings.fxserver.restart_interval_hours')}
                    </span>
                </div>
                <SettingItemDesc>
                    {t('panel.settings.fxserver.restart_interval_desc')} <br />
                    {t('panel.settings.fxserver.restart_interval_both')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.fxserver.quiet_mode_label')}>
                <SwitchText
                    id={cfg.quietMode.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    checked={forceQuietMode || states.quietMode}
                    onCheckedChange={cfg.quietMode.state.set}
                    disabled={pageCtx.isReadOnly || forceQuietMode}
                />
                <SettingItemDesc>
                    {t('panel.settings.fxserver.quiet_mode_desc')} <br />
                    {t('panel.settings.fxserver.quiet_mode_console')}
                    {forceQuietMode && (
                        <>
                            <br />
                            <span className="text-warning-inline">
                                {window.txConsts.hostConfigSource}: {t('panel.settings.fxserver.quiet_mode_locked')}
                            </span>
                        </>
                    )}
                </SettingItemDesc>
            </SettingItem>

            {showAdvanced && <AdvancedDivider />}

            <SettingItem
                label={t('panel.settings.fxserver.cfg_path_label')}
                htmlFor={cfg.cfgPath.eid}
                showIf={showAdvanced}
                required
            >
                <Input
                    id={cfg.cfgPath.eid}
                    ref={cfgPathRef}
                    defaultValue={cfg.cfgPath.initialValue}
                    placeholder={t('panel.settings.fxserver.cfg_path_placeholder')}
                    onInput={() => {
                        cfgPathEdited.current = true;
                        updatePageState();
                    }}
                    disabled={pageCtx.isReadOnly}
                    required
                />
                <SettingItemDesc>
                    {t('panel.settings.fxserver.cfg_path_desc')} <br />
                    {t('panel.settings.fxserver.cfg_path_relative')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.fxserver.startup_args_label')}
                htmlFor={cfg.startupArgs.eid}
                showIf={showAdvanced}
            >
                <Input
                    id={cfg.startupArgs.eid}
                    ref={startupArgsRef}
                    defaultValue={inputArrayUtil.toUi(cfg.startupArgs.initialValue)}
                    placeholder={t('panel.settings.fxserver.startup_args_placeholder')}
                    onInput={() => {
                        startupArgsEdited.current = true;
                        updatePageState();
                    }}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.fxserver.startup_args_desc')} <br />
                    <strong>{t('panel.settings.fxserver.warning_label')}</strong>{' '}
                    {t('panel.settings.fxserver.startup_args_warning')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.fxserver.onesync_label')}
                htmlFor={cfg.onesync.eid}
                showIf={showAdvanced}
            >
                <Select value={states.onesync} onValueChange={handleOneSyncChange} disabled={pageCtx.isReadOnly}>
                    <SelectTrigger id={cfg.onesync.eid}>
                        <SelectValue placeholder={t('panel.settings.fxserver.onesync_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="on">{t('panel.settings.fxserver.onesync_on')}</SelectItem>
                        <SelectItem value="legacy">{t('panel.settings.fxserver.onesync_legacy')}</SelectItem>
                        <SelectItem value="off">{t('panel.settings.fxserver.onesync_off')}</SelectItem>
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    {t('panel.settings.fxserver.onesync_desc')} <br />
                    {t('panel.settings.fxserver.onesync_deprecated')}{' '}
                    <TxAnchor href="https://docs.fivem.net/docs/scripting-reference/onesync/">documentation</TxAnchor>.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.fxserver.autostart_label')} showIf={showAdvanced}>
                <SwitchText
                    id={cfg.autoStart.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    checked={states.autoStart}
                    onCheckedChange={cfg.autoStart.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.fxserver.autostart_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.fxserver.disable_health_check_label')} showIf={showAdvanced}>
                <SwitchText
                    id={cfg.disableHealthCheck.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    checked={states.disableHealthCheck}
                    onCheckedChange={cfg.disableHealthCheck.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.fxserver.disable_health_check_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.fxserver.disable_health_check_note')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.fxserver.http_playerlist_host_label')}
                htmlFor={cfg.httpPlayerlistHost.eid}
                showIf={showAdvanced}
            >
                <Input
                    id={cfg.httpPlayerlistHost.eid}
                    value={states.httpPlayerlistHost}
                    placeholder={t('panel.settings.fxserver.http_playerlist_host_placeholder')}
                    onChange={(event) => cfg.httpPlayerlistHost.state.set(event.target.value)}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.fxserver.http_playerlist_host_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.fxserver.resource_tolerance_label')}
                htmlFor={cfg.resourceTolerance.eid}
                showIf={showAdvanced}
            >
                <Select
                    value={selectNumberUtil.toUi(states.resourceTolerance)}
                    onValueChange={(val) => cfg.resourceTolerance.state.set(selectNumberUtil.toCfg(val))}
                    disabled={pageCtx.isReadOnly}
                >
                    <SelectTrigger id={cfg.resourceTolerance.eid}>
                        <SelectValue placeholder={t('panel.common.select_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="90">{t('panel.settings.fxserver.resource_tolerance_90')}</SelectItem>
                        <SelectItem value="180">{t('panel.settings.fxserver.resource_tolerance_180')}</SelectItem>
                        <SelectItem value="300">{t('panel.settings.fxserver.resource_tolerance_300')}</SelectItem>
                        <SelectItem value="600">{t('panel.settings.fxserver.resource_tolerance_600')}</SelectItem>
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    {t('panel.settings.fxserver.resource_tolerance_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.fxserver.resource_tolerance_note')}
                </SettingItemDesc>
            </SettingItem>

            <Separator />

            <SettingItem label={t('panel.settings.fxserver.log_retention_label')} htmlFor={cfg.serverLogRetention.eid}>
                <div className="flex items-center gap-2">
                    <Select
                        value={customRetentionMode ? '__custom__' : String(states.serverLogRetention)}
                        onValueChange={(val) => {
                            if (val === '__custom__') {
                                setCustomRetentionMode(true);
                            } else {
                                setCustomRetentionMode(false);
                                cfg.serverLogRetention.state.set(Number(val));
                            }
                        }}
                        disabled={pageCtx.isReadOnly}
                    >
                        <SelectTrigger id={cfg.serverLogRetention.eid} className="w-40">
                            <SelectValue placeholder={t('panel.common.select_placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="3">{t('panel.settings.fxserver.log_retention_3')}</SelectItem>
                            <SelectItem value="7">{t('panel.settings.fxserver.log_retention_7')}</SelectItem>
                            <SelectItem value="14">{t('panel.settings.fxserver.log_retention_14')}</SelectItem>
                            <SelectItem value="30">{t('panel.settings.fxserver.log_retention_30')}</SelectItem>
                            <SelectItem value="60">{t('panel.settings.fxserver.log_retention_60')}</SelectItem>
                            <SelectItem value="90">{t('panel.settings.fxserver.log_retention_90')}</SelectItem>
                            <SelectItem value="__custom__">
                                {t('panel.settings.fxserver.log_retention_custom')}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    {customRetentionMode && (
                        <div className="flex items-center gap-1.5">
                            <Input
                                type="number"
                                min={1}
                                max={365}
                                className="h-9 w-20"
                                value={states.serverLogRetention}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val) && val >= 1 && val <= 365) {
                                        cfg.serverLogRetention.state.set(val);
                                    }
                                }}
                                disabled={pageCtx.isReadOnly}
                            />
                            <span className="text-muted-foreground text-sm">
                                {t('panel.settings.fxserver.log_retention_days')}
                            </span>
                        </div>
                    )}
                </div>
                <SettingItemDesc>{t('panel.settings.fxserver.log_retention_desc')}</SettingItemDesc>
            </SettingItem>

            <Separator />

            <SettingItem label={t('panel.settings.fxserver.hide_update_label')} htmlFor="hideFxsUpdate">
                <SwitchText
                    id="hideFxsUpdate"
                    checked={!!states.hideFxsUpdateNotification}
                    onCheckedChange={(checked) => cfg.hideFxsUpdateNotification.state.set(checked)}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.fxserver.hide_update_desc')}</SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}

export default function ConfigCardFxserver(props: SettingsCardProps) {
    return useConfigCardFxserver(props);
}
