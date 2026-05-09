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
                            <span>
                                No schedule set. Click on the <strong>+</strong> button to add a time.
                            </span>
                            <p>
                                {'Presets: '}
                                <a
                                    onClick={() => applyPreset(['00:00'])}
                                    className="text-primary cursor-pointer text-sm hover:underline"
                                >
                                    1x<span className={presetSpanClasses}>/day</span>
                                </a>
                                {', '}
                                <a
                                    onClick={() => applyPreset(['00:00', '12:00'])}
                                    className="text-primary cursor-pointer text-sm hover:underline"
                                >
                                    2x<span className={presetSpanClasses}>/day</span>
                                </a>
                                {', '}
                                <a
                                    onClick={() => applyPreset(['00:00', '08:00', '16:00'])}
                                    className="text-primary cursor-pointer text-sm hover:underline"
                                >
                                    3x<span className={presetSpanClasses}>/day</span>
                                </a>
                                {', '}
                                <a
                                    onClick={() => applyPreset(['00:00', '06:00', '12:00', '18:00'])}
                                    className="text-primary cursor-pointer text-sm hover:underline"
                                >
                                    4x<span className={presetSpanClasses}>/day</span>
                                </a>
                            </p>
                        </div>
                    )}
                    {restartTimes &&
                        restartTimes.map((time, index) => (
                            <div
                                key={time}
                                className="bg-secondary text-secondary-foreground flex items-center space-x-1 rounded-md px-3 py-1 select-none"
                            >
                                <span className="font-mono">{time}</span>
                                {!disabled && (
                                    <button
                                        onClick={() => removeTime(index)}
                                        className="text-secondary-foreground/50 hover:text-destructive ml-2"
                                        aria-label="Remove"
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
                        aria-label="Add"
                        disabled={disabled}
                    >
                        <PlusIcon className="h-4" />
                    </Button>
                    <Button
                        onClick={() => clearTimes()}
                        variant="muted"
                        size={'xs'}
                        className="hover:bg-destructive hover:text-destructive-foreground w-10"
                        aria-label="Clear"
                        disabled={disabled || !restartTimes || restartTimes.length === 0}
                    >
                        <TrashIcon className="h-3.5" />
                    </Button>
                </div>
            </div>
            <TimeInputDialog
                title="Add Restart Time"
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
    try {
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (window.txConsts.serverTimezone !== browserTimezone) {
            return (
                <SettingItemDesc className="text-destructive-inline">
                    <strong>Warning:</strong> Your server timezone is set to{' '}
                    <InlineCode>{window.txConsts.serverTimezone}</InlineCode>, but your browser timezone is{' '}
                    <InlineCode>{browserTimezone}</InlineCode>. Make sure to configure the time according to the server
                    timezone.
                </SettingItemDesc>
            );
        }
    } catch (error) {
        console.error(error);
    }
    return null;
}

const RETENTION_PRESETS = ['3', '7', '14', '30', '60', '90'];

export const pageConfigs = {
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
} as const;

export default function ConfigCardFxserver({ cardCtx, pageCtx }: SettingsCardProps) {
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
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    };

    //Validate changes (for UX only) and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        if (!localConfigs.server?.dataPath) {
            return txToast.error({
                title: 'The Server Data Folder is required.',
                md: true,
                msg: 'If you want to return to the Setup page, click on the "Reset" button instead.',
            });
        }
        if (localConfigs.server.cfgPath !== undefined && !localConfigs.server.cfgPath) {
            return txToast.error({
                title: 'The CFG File Path is required.',
                md: true,
                msg: 'The value should probably be `server.cfg`.',
            });
        }
        if (
            Array.isArray(localConfigs.server?.startupArgs) &&
            localConfigs.server.startupArgs.some((arg: string) => arg.toLowerCase() === 'onesync')
        ) {
            return txToast.error({
                title: 'You cannot set OneSync in Startup Arguments.',
                md: true,
                msg: 'Please use the selectbox below it.',
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
            title: 'Reset Server Data Path',
            message: (
                <>
                    Are you sure you want to reset the server data path? <br />
                    <br />
                    <strong>This will not delete any resource files or database</strong>, but just reset the fxPanel
                    configuration, allowing you to go back to the Setup page. <br />
                    If you want, you can set the path back to the current value later. <br />
                    <br />
                    <strong className="text-warning-inline">Warning:</strong> take note of the current path before
                    proceeding, so you can set it back later if you need to. Current path:
                    <Input value={cfg.dataPath.initialValue} className="mt-2" readOnly />
                </>
            ),
            onConfirm: () => {
                setIsResettingServerData(true);
                resetServerDataApi({
                    toastLoadingMessage: 'Resetting server data path...',
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
            <SettingItem label="Server Data Folder" htmlFor={cfg.dataPath.eid} required>
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
                        <Undo2Icon className="mr-2 h-4 w-4" /> Reset
                    </Button>
                </div>
                <SettingItemDesc>
                    The full path of the folder that <strong>contains</strong> the <InlineCode>resources</InlineCode>{' '}
                    folder, usually it's the same place that contains your <InlineCode>server.cfg</InlineCode>. <br />
                    Resetting this value will allow you to go back to the Setup page, without deleting any files.
                    {pageCtx.apiData?.dataPath && pageCtx.apiData?.hasCustomDataPath && (
                        <>
                            <br />
                            <span className="text-warning-inline">
                                {window.txConsts.hostConfigSource}: This path should start with{' '}
                                <InlineCode>{pageCtx.apiData.dataPath}</InlineCode> .
                            </span>
                        </>
                    )}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Restart Schedule" showOptional>
                <RestartScheduleBox
                    restartTimes={states.restarterSchedule}
                    setRestartTimes={cfg.restarterSchedule.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <TimeZoneWarning />
                <SettingItemDesc>
                    At which times of day to restart the server. <br />
                    <strong>Note:</strong> Make sure your schedule matches your server time and not your local time.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Restart Interval" showOptional>
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
                    <span className="text-muted-foreground text-sm">hours (0 = disabled)</span>
                </div>
                <SettingItemDesc>
                    Restart the server every N hours (based on uptime). Set to 0 to disable. <br />
                    If both a schedule and an interval are set, whichever comes first will trigger the restart.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Quiet Mode">
                <SwitchText
                    id={cfg.quietMode.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    checked={forceQuietMode || states.quietMode}
                    onCheckedChange={cfg.quietMode.state.set}
                    disabled={pageCtx.isReadOnly || forceQuietMode}
                />
                <SettingItemDesc>
                    Do not print FXServer's output to the terminal. <br />
                    You will still be able to use the Live Console.
                    {forceQuietMode && (
                        <>
                            <br />
                            <span className="text-warning-inline">
                                {window.txConsts.hostConfigSource}: This setting is locked and cannot be changed.
                            </span>
                        </>
                    )}
                </SettingItemDesc>
            </SettingItem>

            {showAdvanced && <AdvancedDivider />}

            <SettingItem label="CFG File Path" htmlFor={cfg.cfgPath.eid} showIf={showAdvanced} required>
                <Input
                    id={cfg.cfgPath.eid}
                    ref={cfgPathRef}
                    defaultValue={cfg.cfgPath.initialValue}
                    placeholder="server.cfg"
                    onInput={() => {
                        cfgPathEdited.current = true;
                        updatePageState();
                    }}
                    disabled={pageCtx.isReadOnly}
                    required
                />
                <SettingItemDesc>
                    The path to your server config file, probably named <InlineCode>server.cfg</InlineCode>. <br />
                    This can either be absolute, or relative to the Server Data folder.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Startup Arguments" htmlFor={cfg.startupArgs.eid} showIf={showAdvanced}>
                <Input
                    id={cfg.startupArgs.eid}
                    ref={startupArgsRef}
                    defaultValue={inputArrayUtil.toUi(cfg.startupArgs.initialValue)}
                    placeholder="--trace-warning"
                    onInput={() => {
                        startupArgsEdited.current = true;
                        updatePageState();
                    }}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    Additional command-line arguments to pass to the FXServer instance such as NodeJS CLI flags. <br />
                    <strong>Warning:</strong> You almost certainly should not use this option, commands and convars
                    should be placed in your <InlineCode>server.cfg</InlineCode> instead.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="OneSync" htmlFor={cfg.onesync.eid} showIf={showAdvanced}>
                <Select value={states.onesync} onValueChange={handleOneSyncChange} disabled={pageCtx.isReadOnly}>
                    <SelectTrigger id={cfg.onesync.eid}>
                        <SelectValue placeholder="Select OneSync option" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="on">On (recommended)</SelectItem>
                        <SelectItem value="legacy">Legacy</SelectItem>
                        <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    Most servers should be using <strong>OneSync On</strong>. <br />
                    The other options are considered deprecated and should not be used unless you know what you're
                    doing. For more information, please read the{' '}
                    <TxAnchor href="https://docs.fivem.net/docs/scripting-reference/onesync/">documentation</TxAnchor>.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Autostart" showIf={showAdvanced}>
                <SwitchText
                    id={cfg.autoStart.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    checked={states.autoStart}
                    onCheckedChange={cfg.autoStart.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    Start the server automatically after <strong>fxPanel</strong> starts.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Resource Starting Tolerance" htmlFor={cfg.resourceTolerance.eid} showIf={showAdvanced}>
                <Select
                    value={selectNumberUtil.toUi(states.resourceTolerance)}
                    onValueChange={(val) => cfg.resourceTolerance.state.set(selectNumberUtil.toCfg(val))}
                    disabled={pageCtx.isReadOnly}
                >
                    <SelectTrigger id={cfg.resourceTolerance.eid}>
                        <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="90">1.5 minutes (default)</SelectItem>
                        <SelectItem value="180">3 minutes</SelectItem>
                        <SelectItem value="300">5 minutes</SelectItem>
                        <SelectItem value="600">10 minutes</SelectItem>
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    At server boot, how much time to wait for any single resource to start before restarting the server.{' '}
                    <br />
                    <strong>Note:</strong> If you are getting <InlineCode>failed to start in time</InlineCode> errors,
                    increase this value.
                </SettingItemDesc>
            </SettingItem>

            <Separator />

            <SettingItem label="Server Log Retention" htmlFor={cfg.serverLogRetention.eid}>
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
                            <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="3">3 days</SelectItem>
                            <SelectItem value="7">7 days</SelectItem>
                            <SelectItem value="14">14 days (default)</SelectItem>
                            <SelectItem value="30">30 days</SelectItem>
                            <SelectItem value="60">60 days</SelectItem>
                            <SelectItem value="90">90 days</SelectItem>
                            <SelectItem value="__custom__">Custom</SelectItem>
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
                            <span className="text-muted-foreground text-sm">days</span>
                        </div>
                    )}
                </div>
                <SettingItemDesc>
                    How many days of historical server log sessions to keep. Sessions older than this are automatically
                    deleted.
                </SettingItemDesc>
            </SettingItem>

            <Separator />

            <SettingItem label="Hide FxServer Update" htmlFor="hideFxsUpdate">
                <SwitchText
                    id="hideFxsUpdate"
                    checked={!!states.hideFxsUpdateNotification}
                    onCheckedChange={(checked) => cfg.hideFxsUpdateNotification.state.set(checked)}
                    checkedLabel="Hidden"
                    uncheckedLabel="Visible"
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    Permanently hide the FxServer update notification banner for all admins.
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
