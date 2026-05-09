import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import TxAnchor from '@/components/TxAnchor';
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import SwitchText from '@/components/SwitchText';
import InlineCode from '@/components/InlineCode';
import type { PermissionPreset } from '@shared/permissions';
import type { DiscordLogRouteConfig } from '@shared/discordLogRoutes';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useEffect, useRef, useMemo, useReducer } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { txToast } from '@/components/TxToaster';
import { useOpenEmbedEditor } from '../embedEditorState';
import { useOpenDiscordLogRoutesEditor } from '../discordLogRoutesEditorState';

const defaultPresenceConfig = {
    status: 'online',
    activityType: 'Watching',
    activityText: '[{playerCount}/{maxPlayers}] on {serverName}',
    updateIntervalSeconds: 60,
} as const;

type PresenceConfig = {
    status: 'online' | 'idle' | 'dnd' | 'invisible';
    activityType: 'Playing' | 'Watching' | 'Listening' | 'Competing' | 'Custom';
    activityText: string;
    updateIntervalSeconds: number;
};

type RolePermissionMapping = {
    id: string;
    label: string;
    discordRoleIds: string[];
    permissionPresetId: string | null;
};

const presenceStatusOptions = [
    { value: 'online', label: 'Online' },
    { value: 'idle', label: 'Idle' },
    { value: 'dnd', label: 'Do Not Disturb' },
    { value: 'invisible', label: 'Invisible' },
] as const;

const activityTypeOptions = [
    { value: 'Playing', label: 'Playing' },
    { value: 'Watching', label: 'Watching' },
    { value: 'Listening', label: 'Listening' },
    { value: 'Competing', label: 'Competing' },
    { value: 'Custom', label: 'Custom' },
] as const;

const discordSnowflakePattern = /^\d{17,20}$/;

const generateUuid = () => {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }

    const randomNibble = () => {
        if (cryptoApi?.getRandomValues) {
            const buffer = new Uint8Array(1);
            cryptoApi.getRandomValues(buffer);
            return buffer[0] % 16;
        }

        return Math.floor(Math.random() * 16);
    };

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const nibble = randomNibble();
        const value = char === 'x' ? nibble : (nibble & 0x3) | 0x8;
        return value.toString(16);
    });
};

const normalizeRoleIdsInput = (value: string) => {
    const roleIds = value
        .split(/[\n,;\s]+/)
        .map((token) => token.trim())
        .filter((token) => token.length)
        .map((token) => token.match(/\d{17,20}/)?.[0] ?? token);

    return [...new Set(roleIds)];
};

const resolvePermissionPresets = (value: unknown) => {
    if (!Array.isArray(value)) {
        return [] as PermissionPreset[];
    }

    const seenPresetIds = new Set<string>();
    const presets = [] as PermissionPreset[];

    for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;

        const preset = entry as Partial<PermissionPreset>;
        if (typeof preset.id !== 'string' || !preset.id.length || seenPresetIds.has(preset.id)) continue;
        if (typeof preset.name !== 'string' || !preset.name.trim().length) continue;
        if (!Array.isArray(preset.permissions)) continue;

        seenPresetIds.add(preset.id);
        presets.push({
            id: preset.id,
            name: preset.name.trim(),
            permissions: preset.permissions.filter((permission): permission is string => typeof permission === 'string'),
        });
    }

    return presets;
};

const resolveRolePermissionMappings = (value: unknown) => {
    if (!Array.isArray(value)) {
        return [] as RolePermissionMapping[];
    }

    return value
        .filter((entry): entry is Partial<RolePermissionMapping> => !!entry && typeof entry === 'object')
        .map((entry) => ({
            id: typeof entry.id === 'string' && entry.id.length ? entry.id : generateUuid(),
            label: typeof entry.label === 'string' ? entry.label : '',
            discordRoleIds: Array.isArray(entry.discordRoleIds)
                ? [...new Set(entry.discordRoleIds.filter((roleId): roleId is string => typeof roleId === 'string'))]
                : [],
            permissionPresetId:
                typeof entry.permissionPresetId === 'string' && entry.permissionPresetId.length
                    ? entry.permissionPresetId
                    : null,
        }));
};

const resolvePresenceConfig = (value: unknown): PresenceConfig => {
    if (!value || typeof value !== 'object') {
        return { ...defaultPresenceConfig };
    }

    return {
        ...defaultPresenceConfig,
        ...(value as Partial<PresenceConfig>),
    };
};

export const pageConfigs = {
    botEnabled: getPageConfig('discordBot', 'enabled', undefined, false),
    botToken: getPageConfig('discordBot', 'token'),
    discordGuild: getPageConfig('discordBot', 'guild'),
    presence: getPageConfig('discordBot', 'presence', undefined, defaultPresenceConfig),
    rolePermissions: getPageConfig('discordBot', 'rolePermissions', undefined, [] as RolePermissionMapping[]),
} as const;

export default function ConfigCardDiscord({ cardCtx, pageCtx }: SettingsCardProps) {
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const [roleIdInputs, setRoleIdInputs] = useReducer(
        (state: Record<string, string>, updates: Record<string, string>) => ({ ...state, ...updates }),
        {},
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    //Effects - handle changes and reset advanced settings
    useEffect(() => {
        updatePageState();
    }, [states, roleIdInputs]);

    const openEmbedEditor = useOpenEmbedEditor();
    const openDiscordLogRoutesEditor = useOpenDiscordLogRoutesEditor();
    const presenceConfig = resolvePresenceConfig(states.presence ?? cfg.presence.initialValue);
    const permissionPresets = useMemo(
        () => resolvePermissionPresets(pageCtx.apiData?.permissionPresets),
        [pageCtx.apiData?.permissionPresets],
    );
    const rolePermissionMappings = useMemo(
        () => resolveRolePermissionMappings(states.rolePermissions ?? cfg.rolePermissions.initialValue),
        [states.rolePermissions, cfg.rolePermissions.initialValue],
    );

    //Refs for configs that don't use state
    const botTokenRef = useRef<HTMLInputElement | null>(null);
    const discordGuildRef = useRef<HTMLInputElement | null>(null);

    //Marshalling Utils
    const emptyToNull = (str?: string) => {
        if (str === undefined) return undefined;
        const trimmed = str.trim();
        return trimmed.length ? trimmed : null;
    };

    const setPresenceConfig = <K extends keyof PresenceConfig>(key: K, value: PresenceConfig[K]) => {
        cfg.presence.state.set((prev: unknown) => ({
            ...resolvePresenceConfig(prev),
            [key]: value,
        }));
    };

    const buildRolePermissionMappings = () => {
        return rolePermissionMappings.map((mapping) => ({
            ...mapping,
            label: mapping.label.trim(),
            discordRoleIds: normalizeRoleIdsInput(roleIdInputs[mapping.id] ?? mapping.discordRoleIds.join('\n')),
            permissionPresetId:
                typeof mapping.permissionPresetId === 'string' && mapping.permissionPresetId.length
                    ? mapping.permissionPresetId
                    : null,
        }));
    };

    const setRolePermissions = (updater: (prev: RolePermissionMapping[]) => RolePermissionMapping[]) => {
        cfg.rolePermissions.state.set((prev: unknown) =>
            updater(resolveRolePermissionMappings(prev ?? cfg.rolePermissions.initialValue)),
        );
    };

    const updateRolePermission = <K extends keyof RolePermissionMapping>(
        mappingId: string,
        key: K,
        value: RolePermissionMapping[K],
    ) => {
        setRolePermissions((prev) =>
            prev.map((mapping) => (mapping.id === mappingId ? { ...mapping, [key]: value } : mapping)),
        );
    };

    const addRolePermission = () => {
        const newId = generateUuid();
        setRolePermissions((prev) => [
            ...prev,
            {
                id: newId,
                label: '',
                discordRoleIds: [],
                permissionPresetId: null,
            },
        ]);
        setRoleIdInputs({ [newId]: '' });
    };

    const removeRolePermission = (mappingId: string) => {
        setRolePermissions((prev) => prev.filter((mapping) => mapping.id !== mappingId));
    };

    //Processes the state of the page and sets the card as pending save if needed
    const updatePageState = () => {
        const overwrites = {
            botToken: emptyToNull(botTokenRef.current?.value),
            discordGuild: emptyToNull(discordGuildRef.current?.value),
            rolePermissions: buildRolePermissionMappings(),
        };

        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    };

    //Validate changes (for UX only) and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        const rolePermissions = buildRolePermissionMappings();
        if (localConfigs.discordBot) {
            localConfigs.discordBot.rolePermissions = rolePermissions;
        }

        if (localConfigs.discordBot?.enabled) {
            if (!localConfigs.discordBot?.token) {
                return txToast.error('You must provide a Discord Bot Token to enable the bot.');
            }
            if (!localConfigs.discordBot?.guild) {
                return txToast.error('You must provide a Server ID to enable the bot.');
            }
        }

        const missingMappingLabel = rolePermissions.find((mapping) => !mapping.label.length);
        if (missingMappingLabel) {
            return txToast.error('Each Discord role mapping needs a label.');
        }

        const missingRoles = rolePermissions.find((mapping) => mapping.discordRoleIds.length === 0);
        if (missingRoles) {
            return txToast.error('Each Discord role mapping needs at least one Discord role ID.');
        }

        const invalidRoleId = rolePermissions
            .flatMap((mapping) => mapping.discordRoleIds)
            .find((roleId) => !discordSnowflakePattern.test(roleId));
        if (invalidRoleId) {
            return txToast.error(`Invalid Discord role ID: ${invalidRoleId}`);
        }

        const missingPreset = rolePermissions.find((mapping) => !mapping.permissionPresetId);
        if (missingPreset) {
            return txToast.error('Each Discord role mapping needs a permission preset.');
        }

        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label="Discord Bot">
                <SwitchText
                    id={cfg.botEnabled.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    variant="checkedGreen"
                    checked={states.botEnabled}
                    onCheckedChange={cfg.botEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>Enable Discord Integration.</SettingItemDesc>
            </SettingItem>
            <SettingItem label="Token" htmlFor={cfg.botToken.eid} required={states.botEnabled}>
                <Input
                    id={cfg.botToken.eid}
                    ref={botTokenRef}
                    defaultValue={cfg.botToken.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    maxLength={96}
                    autoComplete="off"
                    className="blur-input"
                    required
                />
                <SettingItemDesc>
                    To get a token and the bot to join your server, follow these two guides:
                    <TxAnchor href="https://discordjs.guide/legacy/preparations/app-setup">
                        Setting up a bot application
                    </TxAnchor>{' '}
                    and{' '}
                    <TxAnchor href="https://discordjs.guide/legacy/preparations/adding-your-app">
                        Adding your bot to servers
                    </TxAnchor>{' '}
                    <br />
                    <strong>Note:</strong> Do not reuse the same token for another bot. <br />
                    <strong>Note:</strong> The bot requires the <strong>Server Members</strong> intent, which can be set
                    at the
                    <TxAnchor href="https://discord.com/developers/applications">Discord Developer Portal</TxAnchor>.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Guild/Server ID" htmlFor={cfg.discordGuild.eid} required={states.botEnabled}>
                <Input
                    id={cfg.discordGuild.eid}
                    ref={discordGuildRef}
                    defaultValue={cfg.discordGuild.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="000000000000000000"
                />
                <SettingItemDesc>
                    The ID of the Discord Server (also known as Discord Guild). <br />
                    To get the Server ID, go to Discord's settings and
                    <TxAnchor href="https://support.discordapp.com/hc/article_attachments/115002742731/mceclip0.png">
                        {' '}
                        enable developer mode
                    </TxAnchor>
                    , then right-click on the guild icon select "Copy ID".
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Discord Logging">
                <div className="flex flex-wrap gap-6">
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const stored = pageCtx.apiData?.storedConfigs?.discordBot?.logRoutes as
                                | DiscordLogRouteConfig[]
                                | undefined;
                            const def = pageCtx.apiData?.defaultConfigs?.discordBot?.logRoutes as
                                | DiscordLogRouteConfig[]
                                | undefined;
                            openDiscordLogRoutesEditor({
                                initialValue: stored ?? def ?? [],
                                defaultValue: def ?? [],
                                warningsChannel:
                                    (pageCtx.apiData?.storedConfigs?.discordBot?.warningsChannel as string | null | undefined) ??
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.warningsChannel as string | null | undefined) ??
                                    null,
                                defaultWarningsChannel:
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.warningsChannel as string | null | undefined) ??
                                    null,
                                logGuildOverride:
                                    (pageCtx.apiData?.storedConfigs?.discordBot?.logGuildOverride as string | null | undefined) ??
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.logGuildOverride as string | null | undefined) ??
                                    null,
                                defaultLogGuildOverride:
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.logGuildOverride as string | null | undefined) ??
                                    null,
                                mainGuildId: emptyToNull(discordGuildRef.current?.value) ?? cfg.discordGuild.initialValue,
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" /> Edit Logging
                    </Button>
                </div>
                <SettingItemDesc>
                    Configure the warnings channel, one shared log guild override, per-route channel selection, and
                    advanced per-entry log filters in a dedicated editor page.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Bot Presence">
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:status`}>
                            Activity Status
                        </label>
                        <Select
                            value={presenceConfig.status}
                            onValueChange={(value: PresenceConfig['status']) => setPresenceConfig('status', value)}
                            disabled={pageCtx.isReadOnly}
                        >
                            <SelectTrigger id={`${cfg.presence.eid}:status`}>
                                <SelectValue placeholder="Select bot status" />
                            </SelectTrigger>
                            <SelectContent>
                                {presenceStatusOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:activity-type`}>
                            Activity Type
                        </label>
                        <Select
                            value={presenceConfig.activityType}
                            onValueChange={(value: PresenceConfig['activityType']) =>
                                setPresenceConfig('activityType', value)
                            }
                            disabled={pageCtx.isReadOnly}
                        >
                            <SelectTrigger id={`${cfg.presence.eid}:activity-type`}>
                                <SelectValue placeholder="Select activity type" />
                            </SelectTrigger>
                            <SelectContent>
                                {activityTypeOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:activity-text`}>
                            Activity Text
                        </label>
                        <Input
                            id={`${cfg.presence.eid}:activity-text`}
                            value={presenceConfig.activityText}
                            onChange={(event) => setPresenceConfig('activityText', event.currentTarget.value)}
                            disabled={pageCtx.isReadOnly}
                            maxLength={128}
                            placeholder="[{playerCount}/{maxPlayers}] on {serverName}"
                        />
                        <SettingItemDesc>
                            Supports <InlineCode>{'{playerCount}'}</InlineCode>,{' '}
                            <InlineCode>{'{maxPlayers}'}</InlineCode>, <InlineCode>{'{serverName}'}</InlineCode>, and{' '}
                            <InlineCode>{'{uptime}'}</InlineCode> placeholders.
                        </SettingItemDesc>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:interval`}>
                            Refresh Interval (seconds)
                        </label>
                        <Input
                            id={`${cfg.presence.eid}:interval`}
                            type="number"
                            min={30}
                            max={3600}
                            step={1}
                            value={presenceConfig.updateIntervalSeconds}
                            onChange={(event) => {
                                const parsed = Number.parseInt(event.currentTarget.value, 10);
                                setPresenceConfig(
                                    'updateIntervalSeconds',
                                    Number.isNaN(parsed) ? defaultPresenceConfig.updateIntervalSeconds : parsed,
                                );
                            }}
                            disabled={pageCtx.isReadOnly}
                        />
                        <SettingItemDesc>
                            Controls how often the bot refreshes the live activity text from fxPanel.
                        </SettingItemDesc>
                    </div>
                </div>
            </SettingItem>
            <SettingItem label="Role Permission Mapping">
                <div className="space-y-4">
                    {rolePermissionMappings.length > 0 ? (
                        rolePermissionMappings.map((mapping) => {
                            const selectedPreset = permissionPresets.find((preset) => preset.id === mapping.permissionPresetId);
                            const fallbackPresetValue = '__unassigned__';

                            return (
                            <div key={mapping.id} className="space-y-4 rounded-md border p-4">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="min-w-56 flex-1 space-y-1">
                                        <label className="text-muted-foreground text-xs" htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:label`}>
                                            Mapping Label
                                        </label>
                                        <Input
                                            id={`${cfg.rolePermissions.eid}:${mapping.id}:label`}
                                            value={mapping.label}
                                            onChange={(event) =>
                                                updateRolePermission(mapping.id, 'label', event.currentTarget.value)
                                            }
                                            disabled={pageCtx.isReadOnly}
                                            placeholder="Moderators"
                                            maxLength={64}
                                        />
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="text-destructive-inline h-9 w-9 shrink-0"
                                        onClick={() => removeRolePermission(mapping.id)}
                                        disabled={pageCtx.isReadOnly}
                                        aria-label="Remove mapping"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </Button>
                                </div>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <label
                                            className="text-muted-foreground text-xs"
                                            htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:roles`}
                                        >
                                            Discord Role IDs
                                        </label>
                                        <Textarea
                                            id={`${cfg.rolePermissions.eid}:${mapping.id}:roles`}
                                            value={roleIdInputs[mapping.id] ?? mapping.discordRoleIds.join('\n')}
                                            onChange={(event) =>
                                                setRoleIdInputs({ [mapping.id]: event.currentTarget.value })
                                            }
                                            disabled={pageCtx.isReadOnly}
                                            placeholder={'123456789012345678\n987654321098765432'}
                                            className="min-h-20 resize-y"
                                        />
                                        <SettingItemDesc>
                                            Paste one or more Discord role IDs or role mentions. Separate entries with
                                            commas, spaces, or new lines.
                                        </SettingItemDesc>
                                    </div>

                                    <div className="space-y-2">
                                        <label
                                            className="text-muted-foreground text-xs"
                                            htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:preset`}
                                        >
                                            Permission Preset
                                        </label>
                                        <Select
                                            value={selectedPreset ? selectedPreset.id : fallbackPresetValue}
                                            onValueChange={(value) =>
                                                updateRolePermission(
                                                    mapping.id,
                                                    'permissionPresetId',
                                                    value === fallbackPresetValue ? null : value,
                                                )
                                            }
                                            disabled={pageCtx.isReadOnly || permissionPresets.length === 0}
                                        >
                                            <SelectTrigger id={`${cfg.rolePermissions.eid}:${mapping.id}:preset`}>
                                                <SelectValue placeholder="Select a permission preset" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value={fallbackPresetValue}>Select a permission preset</SelectItem>
                                                {permissionPresets.map((preset) => (
                                                    <SelectItem key={preset.id} value={preset.id}>
                                                        {preset.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <SettingItemDesc>
                                            Matching Discord roles sync this preset's permissions onto linked admin
                                            accounts.
                                        </SettingItemDesc>
                                    </div>
                                </div>
                            </div>
                        )})
                    ) : (
                        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                            No role mappings configured. Add one to grant fxPanel permission presets to Discord roles.
                        </div>
                    )}

                    {permissionPresets.length === 0 && (
                        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                            No permission presets are available yet. Create one in Admin Manager before saving role
                            mappings here.
                        </div>
                    )}

                    <Button variant="outline" size="sm" onClick={addRolePermission} disabled={pageCtx.isReadOnly}>
                        <PlusIcon className="mr-1 h-4 w-4" /> Add Mapping
                    </Button>
                </div>
                <SettingItemDesc>
                    Link Discord roles to fxPanel permission presets for linked admins. If an admin matches multiple
                    mappings, all matched preset permissions are merged and synced onto their admin account.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Status Embed">
                <div className="flex flex-wrap gap-6">
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const stored = pageCtx.apiData?.storedConfigs?.discordBot?.embedJson as string | undefined;
                            const def = pageCtx.apiData?.defaultConfigs?.discordBot?.embedJson as string | undefined;
                            openEmbedEditor({
                                field: 'embedJson',
                                fieldLabel: 'Status Embed JSON',
                                initialValue: stored ?? def ?? '{}',
                                defaultValue: def ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" /> Change Embed JSON
                    </Button>
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const stored = pageCtx.apiData?.storedConfigs?.discordBot?.embedConfigJson as
                                | string
                                | undefined;
                            const def = pageCtx.apiData?.defaultConfigs?.discordBot?.embedConfigJson as
                                | string
                                | undefined;
                            openEmbedEditor({
                                field: 'embedConfigJson',
                                fieldLabel: 'Status Config JSON',
                                initialValue: stored ?? def ?? '{}',
                                defaultValue: def ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" /> Change Config JSON
                    </Button>
                </div>
                <SettingItemDesc>
                    The server status embed is customizable by editing the two JSONs above. You can add live server
                    stats, occupancy, recent join/leave counts, and the rendered player list through placeholders. <br />
                    <strong>Note:</strong> Use the command <InlineCode>/status add</InlineCode> on a channel that the
                    bot has the "Send Message" permission to setup the embed.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Player List Embed">
                <div className="flex flex-wrap gap-6">
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const stored = pageCtx.apiData?.storedConfigs?.discordBot?.playerListEmbedJson as
                                | string
                                | undefined;
                            const def = pageCtx.apiData?.defaultConfigs?.discordBot?.playerListEmbedJson as
                                | string
                                | undefined;
                            openEmbedEditor({
                                field: 'playerListEmbedJson',
                                fieldLabel: 'Player List Embed JSON',
                                initialValue: stored ?? def ?? '{}',
                                defaultValue: def ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" /> Change Embed JSON
                    </Button>
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const stored = pageCtx.apiData?.storedConfigs?.discordBot?.playerListEmbedConfigJson as
                                | string
                                | undefined;
                            const def = pageCtx.apiData?.defaultConfigs?.discordBot?.playerListEmbedConfigJson as
                                | string
                                | undefined;
                            openEmbedEditor({
                                field: 'playerListEmbedConfigJson',
                                fieldLabel: 'Player List Config JSON',
                                initialValue: stored ?? def ?? '{}',
                                defaultValue: def ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" /> Change Config JSON
                    </Button>
                </div>
                <SettingItemDesc>
                    The live player list embed is customizable by editing the two JSONs above. <br />
                    <strong>Note:</strong> Use the command <InlineCode>/players add</InlineCode> on a channel that the
                    bot has the "Send Message" permission to setup the embed.
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
