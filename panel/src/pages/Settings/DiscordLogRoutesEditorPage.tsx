import { useEffect, useMemo, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { navigate } from 'wouter/use-browser-location';
import { Settings2Icon, Save, RotateCcw, XIcon, Loader2Icon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SwitchText from '@/components/SwitchText';
import { txToast } from '@/components/TxToaster';
import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import type { SaveConfigsReq, SaveConfigsResp } from '@shared/otherTypes';
import { emsg } from '@shared/emsg';
import discordLogRoutes from '@shared/discordLogRoutes';
import type { DiscordLogRouteConfig, DiscordLogRouteKey } from '@shared/discordLogRoutes';
import { AdvancedDivider } from './settingsItems';
import { discordLogRoutesEditorAtom } from './discordLogRoutesEditorState';

const {
    discordLogRouteDefinitions,
    getDiscordLogRouteEntryDefinitions,
    normalizeDiscordLogRoutes,
} = discordLogRoutes;

type DiscordLogRouteFormState = Omit<DiscordLogRouteConfig, 'channelId'> & {
    channelId: string;
};

const discordSnowflakePattern = /^\d{17,20}$/;
const warningsEntryKey = 'warnings' as const;

type DiscordLogEditorEntryKey = DiscordLogRouteKey | typeof warningsEntryKey;

const emptyToNull = (value?: string) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
};

const resolveDiscordLogRoutes = (value: unknown) => {
    const configuredRoutes = new Map(normalizeDiscordLogRoutes(value).map((route) => [route.key, route]));

    return discordLogRouteDefinitions.map((definition) => {
        const configuredRoute = configuredRoutes.get(definition.key);

        return {
            key: definition.key,
            enabled: configuredRoute?.enabled === true,
            channelId: configuredRoute?.channelId ?? '',
            useEntryFilter: configuredRoute?.useEntryFilter === true,
            entryFilter: configuredRoute?.entryFilter ?? [],
        } satisfies DiscordLogRouteFormState;
    });
};

const buildLogRoutes = (routes: DiscordLogRouteFormState[]) => {
    return routes.map((route) => ({
        key: route.key,
        enabled: route.enabled,
        channelId: emptyToNull(route.channelId) ?? null,
        useEntryFilter: route.useEntryFilter,
        entryFilter: route.entryFilter,
    }));
};

const getValidationError = (routes: DiscordLogRouteConfig[], warningsChannel: string, logGuildOverride: string) => {
    const invalidLogChannel = routes.find(
        (route) => route.enabled && route.channelId && !discordSnowflakePattern.test(route.channelId),
    );
    if (invalidLogChannel) {
        const routeLabel = discordLogRouteDefinitions.find((route) => route.key === invalidLogChannel.key)?.label;
        return `Invalid channel ID for ${routeLabel ?? invalidLogChannel.key}.`;
    }

    const normalizedWarningsChannel = emptyToNull(warningsChannel);
    if (normalizedWarningsChannel && !discordSnowflakePattern.test(normalizedWarningsChannel)) {
        return 'Invalid Warnings Channel ID.';
    }

    const normalizedLogGuildOverride = emptyToNull(logGuildOverride);
    if (normalizedLogGuildOverride && !discordSnowflakePattern.test(normalizedLogGuildOverride)) {
        return 'Invalid Log Guild Override.';
    }

    const missingLogChannel = routes.find((route) => route.enabled && !route.channelId);
    if (missingLogChannel) {
        const routeLabel = discordLogRouteDefinitions.find((route) => route.key === missingLogChannel.key)?.label;
        return `${routeLabel ?? missingLogChannel.key} needs a channel ID.`;
    }

    return null;
};

export default function DiscordLogRoutesEditorPage() {
    const editorState = useAtomValue(discordLogRoutesEditorAtom);
    const setEditorState = useSetAtom(discordLogRoutesEditorAtom);
    const [routes, setRoutes] = useState<DiscordLogRouteFormState[]>([]);
    const [warningsChannel, setWarningsChannel] = useState('');
    const [logGuildOverride, setLogGuildOverride] = useState('');
    const [selectedEntryKey, setSelectedEntryKey] = useState<DiscordLogEditorEntryKey>(warningsEntryKey);
    const [advancedState, setAdvancedState] = useState<Record<string, boolean>>({});
    const [isSaving, setIsSaving] = useState(false);

    const saveApi = useBackendApi<SaveConfigsResp, SaveConfigsReq>({
        method: 'POST',
        path: '/settings/configs/:card',
        throwGenericErrors: true,
    });

    useEffect(() => {
        if (editorState) {
            setRoutes(resolveDiscordLogRoutes(editorState.initialValue));
            setWarningsChannel(editorState.warningsChannel ?? '');
            setLogGuildOverride(editorState.logGuildOverride ?? '');
            setAdvancedState({});
        }
    }, [editorState]);

    useEffect(() => {
        if (!editorState) {
            navigate('/settings#discord');
        }
    }, [editorState]);

    useEffect(() => {
        if (selectedEntryKey === warningsEntryKey) return;

        if (!routes.some((route) => route.key === selectedEntryKey) && routes[0]) {
            setSelectedEntryKey(warningsEntryKey);
        }
    }, [routes, selectedEntryKey]);

    const selectedRoute = useMemo(() => {
        if (selectedEntryKey === warningsEntryKey) return null;

        return routes.find((route) => route.key === selectedEntryKey) ?? null;
    }, [routes, selectedEntryKey]);
    const selectedDefinition = useMemo(() => {
        if (!selectedRoute) return null;
        return discordLogRouteDefinitions.find((definition) => definition.key === selectedRoute.key) ?? null;
    }, [selectedRoute]);
    const selectedEntryDefinitions = useMemo(() => {
        if (!selectedRoute) return [];
        return getDiscordLogRouteEntryDefinitions(selectedRoute.key);
    }, [selectedRoute]);
    const builtRoutes = useMemo(() => buildLogRoutes(routes), [routes]);
    const validationError = useMemo(
        () => getValidationError(builtRoutes, warningsChannel, logGuildOverride),
        [builtRoutes, warningsChannel, logGuildOverride],
    );

    if (!editorState) return null;

    const updateRoute = <K extends keyof DiscordLogRouteFormState>(
        routeKey: DiscordLogRouteKey,
        key: K,
        value: DiscordLogRouteFormState[K],
    ) => {
        setRoutes((prev) => prev.map((route) => (route.key === routeKey ? { ...route, [key]: value } : route)));
    };

    const toggleRouteEntry = (routeKey: DiscordLogRouteKey, entryId: string, checked: boolean) => {
        setRoutes((prev) =>
            prev.map((route) => {
                if (route.key !== routeKey) return route;

                const allEntryIds = getDiscordLogRouteEntryDefinitions(routeKey).map((entry) => entry.id);
                const nextSet = new Set(route.useEntryFilter ? route.entryFilter : allEntryIds);
                if (checked) {
                    nextSet.add(entryId);
                } else {
                    nextSet.delete(entryId);
                }

                return {
                    ...route,
                    useEntryFilter: true,
                    entryFilter: allEntryIds.filter((id) => nextSet.has(id)),
                };
            }),
        );
    };

    const setRouteAdvanced = (routeKey: DiscordLogRouteKey, enabled: boolean) => {
        setAdvancedState((prev) => ({ ...prev, [routeKey]: enabled }));
        setRoutes((prev) =>
            prev.map((route) => {
                if (route.key !== routeKey) return route;

                const allEntryIds = getDiscordLogRouteEntryDefinitions(routeKey).map((entry) => entry.id);

                if (!enabled) {
                    return {
                        ...route,
                        useEntryFilter: false,
                    };
                }

                return {
                    ...route,
                    useEntryFilter: true,
                    entryFilter:
                        route.useEntryFilter && route.entryFilter.length ? route.entryFilter : [...allEntryIds],
                };
            }),
        );
    };

    const handleSave = async () => {
        if (validationError || isSaving) return;

        const toastId = txToast.loading('Saving Discord logging settings...', { id: 'discordLogRoutesSave' });
        setIsSaving(true);
        try {
            const changes = {
                discordBot: {
                    logRoutes: builtRoutes,
                    warningsChannel: emptyToNull(warningsChannel) ?? null,
                    logGuildOverride: emptyToNull(logGuildOverride) ?? null,
                },
            };
            const resp = await saveApi({
                pathParams: { card: 'discord-bot' },
                data: { resetKeys: [], changes },
                timeout: ApiTimeout.LONG,
                toastId,
            });
            if (!resp) throw new Error('empty_response');
            if (resp.type === 'error') return;

            setEditorState({
                ...editorState,
                initialValue: builtRoutes,
                warningsChannel: emptyToNull(warningsChannel) ?? null,
                logGuildOverride: emptyToNull(logGuildOverride) ?? null,
            });
            navigate('/settings#discord');
        } catch (error) {
            txToast.error(
                {
                    title: 'Error saving Discord logging settings:',
                    msg: emsg(error),
                },
                { id: toastId },
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        navigate('/settings#discord');
    };

    const handleDiscard = () => {
        setRoutes(resolveDiscordLogRoutes(editorState.initialValue));
        setWarningsChannel(editorState.warningsChannel ?? '');
        setLogGuildOverride(editorState.logGuildOverride ?? '');
        setAdvancedState({});
    };

    const handleReset = () => {
        setRoutes(resolveDiscordLogRoutes(editorState.defaultValue));
        setWarningsChannel(editorState.defaultWarningsChannel ?? '');
        setLogGuildOverride(editorState.defaultLogGuildOverride ?? '');
        setAdvancedState({});
    };

    const isAdvancedOpen = selectedRoute ? advancedState[selectedRoute.key] ?? selectedRoute.useEntryFilter : false;
    const isWarningsSelected = selectedEntryKey === warningsEntryKey;

    return (
        <div className="max-h-contentvh flex h-full w-full flex-col">
            <PageHeader
                icon={<Settings2Icon />}
                title="Discord Logging"
                parentName="Settings"
                parentLink="/settings#discord"
            />
            <div className="xs:px-3 mx-auto flex min-h-0 w-full grow flex-col px-0 md:px-0">
                <div className="mb-4 flex-none space-y-2">
                    <p className="text-muted-foreground">
                        Route fxPanel activity into Discord without cluttering the main settings page. Configure the
                        shared guild override for log delivery when needed, then select a log stream or the warnings
                        channel from the list and route it to the right channel.
                    </p>
                </div>

                <div className="mb-4 flex-none">
                    <div className="bg-card rounded-xl border p-4">
                        <div className="space-y-2">
                            <label className="text-muted-foreground text-xs" htmlFor="discord-logging:log-guild-override">
                                Log Guild Override
                            </label>
                            <Input
                                id="discord-logging:log-guild-override"
                                value={logGuildOverride}
                                onChange={(event) => setLogGuildOverride(event.currentTarget.value)}
                                placeholder={editorState.mainGuildId || 'Uses the main Guild/Server ID'}
                            />
                            <p className="text-muted-foreground text-xs">
                                Leave blank to use the main Guild/Server ID from Discord settings. This applies to all
                                Discord log routes on this page.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="bg-card min-h-0 overflow-hidden rounded-xl border">
                        <ScrollArea className="h-full">
                            <div className="space-y-2 p-3">
                                <button
                                    type="button"
                                    onClick={() => setSelectedEntryKey(warningsEntryKey)}
                                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                        isWarningsSelected
                                            ? 'border-primary bg-primary/5'
                                            : 'hover:bg-muted/40 border-transparent'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">Warnings Channel</div>
                                        <span
                                            className={`text-xs ${warningsChannel ? 'text-green-600' : 'text-muted-foreground'}`}
                                        >
                                            {warningsChannel ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                    <div className="text-muted-foreground mt-1 text-xs">
                                        {warningsChannel || 'No channel configured'}
                                    </div>
                                </button>

                                {routes.map((route) => {
                                    const definition = discordLogRouteDefinitions.find((entry) => entry.key === route.key);
                                    if (!definition) return null;

                                    const isSelected = route.key === selectedEntryKey;

                                    return (
                                        <button
                                            key={route.key}
                                            type="button"
                                            onClick={() => setSelectedEntryKey(route.key)}
                                            className={`w-full rounded-lg border p-3 text-left transition-colors ${
                                                isSelected
                                                    ? 'border-primary bg-primary/5'
                                                    : 'hover:bg-muted/40 border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-medium">{definition.label}</div>
                                                <span
                                                    className={`text-xs ${route.enabled ? 'text-green-600' : 'text-muted-foreground'}`}
                                                >
                                                    {route.enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                            </div>
                                            <div className="text-muted-foreground mt-1 text-xs">
                                                {route.channelId || 'No channel configured'}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    <div className="bg-card min-h-0 overflow-hidden rounded-xl border">
                        {isWarningsSelected ? (
                            <ScrollArea className="h-full">
                                <div className="space-y-6 p-6">
                                    <div className="space-y-2">
                                        <h2 className="text-xl font-semibold">Warnings Channel</h2>
                                        <p className="text-muted-foreground max-w-2xl text-sm">
                                            Announcements such as server restarts and warning-style bot messages are
                                            delivered here. Leave it blank to disable them.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-muted-foreground text-xs" htmlFor="discord-logging:warnings-channel">
                                            Warnings Channel ID
                                        </label>
                                        <Input
                                            id="discord-logging:warnings-channel"
                                            value={warningsChannel}
                                            onChange={(event) => setWarningsChannel(event.currentTarget.value)}
                                            placeholder="000000000000000000"
                                        />
                                        <p className="text-muted-foreground text-xs">
                                            Use a Discord channel ID here if you want restart and warning-style
                                            messages sent by the bot. Leave it blank to disable this output.
                                        </p>
                                    </div>
                                </div>
                            </ScrollArea>
                        ) : selectedRoute && selectedDefinition ? (
                            <ScrollArea className="h-full">
                                <div className="space-y-6 p-6">
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h2 className="text-xl font-semibold">{selectedDefinition.label}</h2>
                                                <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
                                                    {selectedDefinition.description}
                                                </p>
                                            </div>
                                            <SwitchText
                                                id={`discord-log-route:${selectedRoute.key}:enabled`}
                                                checkedLabel="Enabled"
                                                uncheckedLabel="Disabled"
                                                variant="checkedGreen"
                                                checked={selectedRoute.enabled}
                                                onCheckedChange={(checked) => updateRoute(selectedRoute.key, 'enabled', checked)}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <label
                                                className="text-muted-foreground text-xs"
                                                htmlFor={`discord-log-route:${selectedRoute.key}:channel`}
                                            >
                                                Channel ID
                                            </label>
                                            <Input
                                                id={`discord-log-route:${selectedRoute.key}:channel`}
                                                value={selectedRoute.channelId}
                                                onChange={(event) =>
                                                    updateRoute(selectedRoute.key, 'channelId', event.currentTarget.value)
                                                }
                                                placeholder="000000000000000000"
                                            />
                                            <p className="text-muted-foreground text-xs">
                                                This is the Discord channel that will receive this log stream.
                                            </p>
                                        </div>
                                    </div>

                                    {selectedDefinition.supportsEntryFilter && (
                                        <div className="space-y-4">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setRouteAdvanced(selectedRoute.key, !isAdvancedOpen)}
                                            >
                                                {isAdvancedOpen ? 'Hide Entry Filters' : 'Show Entry Filters'}
                                            </Button>

                                            {isAdvancedOpen && (
                                                <div className="space-y-4">
                                                    <AdvancedDivider />
                                                    <p className="text-muted-foreground text-sm">
                                                        Break down this route by individual log events. Unchecked
                                                        events stay silent even while the route itself is enabled.
                                                    </p>
                                                    <div className="grid gap-3 md:grid-cols-2">
                                                        {selectedEntryDefinitions.map((entry) => {
                                                            const isChecked =
                                                                !selectedRoute.useEntryFilter ||
                                                                selectedRoute.entryFilter.includes(entry.id);

                                                            return (
                                                                <label
                                                                    key={entry.id}
                                                                    className="flex items-start gap-3 rounded-md border p-3"
                                                                >
                                                                    <Checkbox
                                                                        checked={isChecked}
                                                                        onCheckedChange={(checked) =>
                                                                            toggleRouteEntry(
                                                                                selectedRoute.key,
                                                                                entry.id,
                                                                                checked === true,
                                                                            )
                                                                        }
                                                                    />
                                                                    <div className="space-y-1">
                                                                        <div className="text-sm font-medium">{entry.label}</div>
                                                                        <div className="text-muted-foreground text-xs">
                                                                            {entry.description}
                                                                        </div>
                                                                    </div>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                    {!selectedEntryDefinitions.length && (
                                                        <p className="text-muted-foreground text-sm">
                                                            No entry filters are available for this route yet.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        ) : null}
                    </div>
                </div>

                <div className="mt-4 mb-6 flex-none">
                    {validationError && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{validationError}</AlertDescription>
                        </Alert>
                    )}
                    <div className="flex flex-wrap justify-between gap-2">
                        <Button variant="outline" onClick={handleBack}>
                            Back to Settings
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={handleDiscard}>
                                <XIcon className="mr-2 h-4 w-4" /> Discard Changes
                            </Button>
                            <Button
                                variant="outline"
                                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                onClick={handleReset}
                            >
                                <RotateCcw className="mr-2 h-4 w-4" /> Reset to Default
                            </Button>
                            <Button onClick={handleSave} disabled={!!validationError || isSaving}>
                                {isSaving ? (
                                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}