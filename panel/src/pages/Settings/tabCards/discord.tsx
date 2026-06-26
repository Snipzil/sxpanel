import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DiscordRoleMultiSelect } from '@/components/DiscordRoleMultiSelect';
import { isValidDiscordSnowflake } from '@/lib/discordRoleIds';
import TxAnchor from '@/components/TxAnchor';
import { PencilIcon, PlusIcon, TrashIcon } from 'lucide-react';
import SwitchText from '@/components/SwitchText';
import InlineCode from '@/components/InlineCode';
import type { PermissionPreset } from '@shared/permissions';
import type { DiscordLogRouteConfig } from '@shared/discordLogRoutes';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { Separator } from '@/components/ui/separator';
import { useEffect, useRef, useMemo, useReducer } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
    reconcileCardPendingSave,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { txToast } from '@/components/TxToaster';
import { useOpenEmbedEditor } from '../embedEditorState';
import { useOpenDiscordLogRoutesEditor } from '../discordLogRoutesEditorState';
import { useLocale } from '@/hooks/locale';

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
            permissions: preset.permissions.filter(
                (permission): permission is string => typeof permission === 'string',
            ),
        });
    }

    return presets;
};

const resolveRolePermissionMappings = (value: unknown) => {
    if (!Array.isArray(value)) {
        return [] as RolePermissionMapping[];
    }

    return value.reduce<RolePermissionMapping[]>((mappings, entry) => {
        if (!entry || typeof entry !== 'object') {
            return mappings;
        }

        const mappingEntry = entry as {
            id?: unknown;
            label?: unknown;
            discordRoleIds?: unknown;
            permissionPresetId?: unknown;
        };
        const discordRoleIds = Array.isArray(mappingEntry.discordRoleIds)
            ? mappingEntry.discordRoleIds.reduce<string[]>((roleIds, roleId) => {
                  if (typeof roleId === 'string') {
                      roleIds.push(roleId);
                  }
                  return roleIds;
              }, [])
            : [];

        mappings.push({
            id: typeof mappingEntry.id === 'string' && mappingEntry.id.length ? mappingEntry.id : generateUuid(),
            label: typeof mappingEntry.label === 'string' ? mappingEntry.label : '',
            discordRoleIds: [...new Set(discordRoleIds)],
            permissionPresetId:
                typeof mappingEntry.permissionPresetId === 'string' && mappingEntry.permissionPresetId.length
                    ? mappingEntry.permissionPresetId
                    : null,
        });

        return mappings;
    }, []);
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

const pageConfigs = {
    botEnabled: getPageConfig('discordBot', 'enabled', undefined, false),
    botToken: getPageConfig('discordBot', 'token'),
    discordGuild: getPageConfig('discordBot', 'guild'),
    presence: getPageConfig('discordBot', 'presence', undefined, defaultPresenceConfig),
    rolePermissions: getPageConfig('discordBot', 'rolePermissions', undefined, [] as RolePermissionMapping[]),
    oauthClientId: getPageConfig('discordBot', 'oauthClientId'),
    oauthClientSecret: getPageConfig('discordBot', 'oauthClientSecret'),
} as const;

function useConfigCardDiscord({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    //Effects - handle changes and reset advanced settings
    useEffect(() => {
        updatePageState();
    }, [states]);

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
    const oauthClientIdRef = useRef<HTMLInputElement | null>(null);
    const oauthClientSecretRef = useRef<HTMLInputElement | null>(null);

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
            discordRoleIds: [...mapping.discordRoleIds],
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
            oauthClientId: emptyToNull(oauthClientIdRef.current?.value),
            oauthClientSecret: emptyToNull(oauthClientSecretRef.current?.value),
        };

        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, res.hasChanges));
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
                return txToast.error(t('panel.settings.discord_bot.toast_token_required'));
            }
            if (!localConfigs.discordBot?.guild) {
                return txToast.error(t('panel.settings.discord_bot.toast_guild_required'));
            }
        }

        const missingMappingLabel = rolePermissions.find((mapping) => !mapping.label.length);
        if (missingMappingLabel) {
            return txToast.error(t('panel.settings.discord_bot.toast_mapping_label_required'));
        }

        const missingRoles = rolePermissions.find((mapping) => mapping.discordRoleIds.length === 0);
        if (missingRoles) {
            return txToast.error(t('panel.settings.discord_bot.toast_mapping_roles_required'));
        }

        const invalidRoleId = rolePermissions
            .flatMap((mapping) => mapping.discordRoleIds)
            .find((roleId) => !isValidDiscordSnowflake(roleId));
        if (invalidRoleId) {
            return txToast.error(t('panel.settings.discord_bot.toast_invalid_role_id', { roleId: invalidRoleId }));
        }

        const missingPreset = rolePermissions.find((mapping) => !mapping.permissionPresetId);
        if (missingPreset) {
            return txToast.error(t('panel.settings.discord_bot.toast_mapping_preset_required'));
        }

        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label={t('panel.settings.discord_bot.bot_label')}>
                <SwitchText
                    id={cfg.botEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.botEnabled}
                    onCheckedChange={cfg.botEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.discord_bot.bot_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.discord_bot.token_label')}
                htmlFor={cfg.botToken.eid}
                required={states.botEnabled}
            >
                <Input
                    id={cfg.botToken.eid}
                    ref={botTokenRef}
                    defaultValue={cfg.botToken.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder={t('panel.settings.discord_bot.token_placeholder')}
                    maxLength={96}
                    autoComplete="off"
                    className="blur-input"
                    required
                />
                <SettingItemDesc>
                    {t('panel.settings.discord_bot.token_desc_guides')}{' '}
                    <TxAnchor href="https://discordjs.guide/legacy/preparations/app-setup">
                        {t('panel.settings.discord_bot.token_guide_setup')}
                    </TxAnchor>{' '}
                    {t('panel.settings.discord_bot.token_guide_and')}{' '}
                    <TxAnchor href="https://discordjs.guide/legacy/preparations/adding-your-app">
                        {t('panel.settings.discord_bot.token_guide_add')}
                    </TxAnchor>{' '}
                    <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.discord_bot.token_note_reuse')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.discord_bot.token_note_intent')}{' '}
                    <TxAnchor href="https://discord.com/developers/applications">Discord Developer Portal</TxAnchor>.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.discord_bot.guild_label')}
                htmlFor={cfg.discordGuild.eid}
                required={states.botEnabled}
            >
                <Input
                    id={cfg.discordGuild.eid}
                    ref={discordGuildRef}
                    defaultValue={cfg.discordGuild.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder={t('panel.settings.discord_bot.guild_placeholder')}
                />
                <SettingItemDesc>
                    {t('panel.settings.discord_bot.guild_desc')} <br />
                    {t('panel.settings.discord_bot.guild_dev_mode')}{' '}
                    <TxAnchor href="https://support.discordapp.com/hc/article_attachments/115002742731/mceclip0.png">
                        enable developer mode
                    </TxAnchor>
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.discord_bot.logging_label')}>
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
                                    (pageCtx.apiData?.storedConfigs?.discordBot?.warningsChannel as
                                        | string
                                        | null
                                        | undefined) ??
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.warningsChannel as
                                        | string
                                        | null
                                        | undefined) ??
                                    null,
                                defaultWarningsChannel:
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.warningsChannel as
                                        | string
                                        | null
                                        | undefined) ?? null,
                                logGuildOverride:
                                    (pageCtx.apiData?.storedConfigs?.discordBot?.logGuildOverride as
                                        | string
                                        | null
                                        | undefined) ??
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.logGuildOverride as
                                        | string
                                        | null
                                        | undefined) ??
                                    null,
                                defaultLogGuildOverride:
                                    (pageCtx.apiData?.defaultConfigs?.discordBot?.logGuildOverride as
                                        | string
                                        | null
                                        | undefined) ?? null,
                                mainGuildId:
                                    emptyToNull(discordGuildRef.current?.value) ?? cfg.discordGuild.initialValue,
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" />{' '}
                        {t('panel.settings.discord_bot.edit_logging')}
                    </Button>
                </div>
                <SettingItemDesc>{t('panel.settings.discord_bot.logging_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.discord_bot.presence_label')}>
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:status`}>
                            {t('panel.settings.discord_bot.presence_status_label')}
                        </label>
                        <Select
                            value={presenceConfig.status}
                            onValueChange={(value: PresenceConfig['status']) => setPresenceConfig('status', value)}
                            disabled={pageCtx.isReadOnly}
                        >
                            <SelectTrigger id={`${cfg.presence.eid}:status`}>
                                <SelectValue
                                    placeholder={t('panel.settings.discord_bot.presence_status_placeholder')}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {presenceStatusOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {t(`panel.settings.discord_bot.presence_status_${option.value}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:activity-type`}>
                            {t('panel.settings.discord_bot.presence_type_label')}
                        </label>
                        <Select
                            value={presenceConfig.activityType}
                            onValueChange={(value: PresenceConfig['activityType']) =>
                                setPresenceConfig('activityType', value)
                            }
                            disabled={pageCtx.isReadOnly}
                        >
                            <SelectTrigger id={`${cfg.presence.eid}:activity-type`}>
                                <SelectValue placeholder={t('panel.settings.discord_bot.presence_type_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {activityTypeOptions.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {t(`panel.settings.discord_bot.presence_type_${option.value.toLowerCase()}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:activity-text`}>
                            {t('panel.settings.discord_bot.presence_text_label')}
                        </label>
                        <Input
                            id={`${cfg.presence.eid}:activity-text`}
                            value={presenceConfig.activityText}
                            onChange={(event) => setPresenceConfig('activityText', event.currentTarget.value)}
                            disabled={pageCtx.isReadOnly}
                            maxLength={128}
                            placeholder={t('panel.settings.discord_bot.presence_text_placeholder')}
                        />
                        <SettingItemDesc>{t('panel.settings.discord_bot.presence_text_desc')}</SettingItemDesc>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor={`${cfg.presence.eid}:interval`}>
                            {t('panel.settings.discord_bot.presence_interval_label')}
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
                        <SettingItemDesc>{t('panel.settings.discord_bot.presence_interval_desc')}</SettingItemDesc>
                    </div>
                </div>
            </SettingItem>
            <SettingItem label={t('panel.settings.discord_bot.role_mapping_label')}>
                <div className="space-y-4">
                    {rolePermissionMappings.length > 0 ? (
                        rolePermissionMappings.map((mapping) => {
                            const selectedPreset = permissionPresets.find(
                                (preset) => preset.id === mapping.permissionPresetId,
                            );
                            const fallbackPresetValue = '__unassigned__';

                            return (
                                <div key={mapping.id} className="space-y-4 rounded-md border p-4">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="min-w-56 flex-1 space-y-1">
                                            <label
                                                className="text-muted-foreground text-xs"
                                                htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:label`}
                                            >
                                                {t('panel.settings.discord_bot.mapping_label')}
                                            </label>
                                            <Input
                                                id={`${cfg.rolePermissions.eid}:${mapping.id}:label`}
                                                value={mapping.label}
                                                onChange={(event) =>
                                                    updateRolePermission(mapping.id, 'label', event.currentTarget.value)
                                                }
                                                disabled={pageCtx.isReadOnly}
                                                placeholder={t('panel.settings.discord_bot.mapping_label_placeholder')}
                                                maxLength={64}
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            className="text-destructive-inline size-9 shrink-0"
                                            onClick={() => removeRolePermission(mapping.id)}
                                            disabled={pageCtx.isReadOnly}
                                            aria-label={t('panel.settings.discord_bot.remove_mapping_aria')}
                                        >
                                            <TrashIcon className="size-4" />
                                        </Button>
                                    </div>

                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-1">
                                            <label
                                                className="text-muted-foreground text-xs"
                                                htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:roles`}
                                            >
                                                {t('panel.settings.discord_bot.mapping_roles_label')}
                                            </label>
                                            <DiscordRoleMultiSelect
                                                id={`${cfg.rolePermissions.eid}:${mapping.id}:roles`}
                                                value={mapping.discordRoleIds}
                                                onChange={(roleIds) =>
                                                    updateRolePermission(mapping.id, 'discordRoleIds', roleIds)
                                                }
                                                disabled={pageCtx.isReadOnly || !states.botEnabled}
                                            />
                                            <SettingItemDesc>
                                                {t('panel.settings.discord_bot.mapping_roles_desc')}
                                            </SettingItemDesc>
                                        </div>

                                        <div className="space-y-2">
                                            <label
                                                className="text-muted-foreground text-xs"
                                                htmlFor={`${cfg.rolePermissions.eid}:${mapping.id}:preset`}
                                            >
                                                {t('panel.settings.discord_bot.mapping_preset_label')}
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
                                                    <SelectValue
                                                        placeholder={t(
                                                            'panel.settings.discord_bot.mapping_preset_placeholder',
                                                        )}
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={fallbackPresetValue}>
                                                        {t('panel.settings.discord_bot.mapping_preset_unassigned')}
                                                    </SelectItem>
                                                    {permissionPresets.map((preset) => (
                                                        <SelectItem key={preset.id} value={preset.id}>
                                                            {preset.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <SettingItemDesc>
                                                {t('panel.settings.discord_bot.mapping_preset_desc')}
                                            </SettingItemDesc>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                            {t('panel.settings.discord_bot.mapping_empty')}
                        </div>
                    )}

                    {permissionPresets.length === 0 && (
                        <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
                            {t('panel.settings.discord_bot.mapping_no_presets')}
                        </div>
                    )}

                    <Button variant="outline" size="sm" onClick={addRolePermission} disabled={pageCtx.isReadOnly}>
                        <PlusIcon className="mr-1 size-4" /> {t('panel.settings.discord_bot.add_mapping')}
                    </Button>
                </div>
                <SettingItemDesc>{t('panel.settings.discord_bot.role_mapping_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.discord_bot.status_embed_label')}>
                <div className="flex flex-wrap gap-6">
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const storedEmbed = pageCtx.apiData?.storedConfigs?.discordBot?.embedJson as
                                | string
                                | undefined;
                            const defEmbed = pageCtx.apiData?.defaultConfigs?.discordBot?.embedJson as
                                | string
                                | undefined;
                            const storedConfig = pageCtx.apiData?.storedConfigs?.discordBot?.embedConfigJson as
                                | string
                                | undefined;
                            const defConfig = pageCtx.apiData?.defaultConfigs?.discordBot?.embedConfigJson as
                                | string
                                | undefined;
                            openEmbedEditor({
                                variant: 'status',
                                embedJson: storedEmbed ?? defEmbed ?? '{}',
                                embedConfigJson: storedConfig ?? defConfig ?? '{}',
                                initialEmbedJson: storedEmbed ?? defEmbed ?? '{}',
                                initialEmbedConfigJson: storedConfig ?? defConfig ?? '{}',
                                defaultEmbedJson: defEmbed ?? '{}',
                                defaultEmbedConfigJson: defConfig ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" />{' '}
                        {t('panel.settings.discord_bot.edit_status_embed')}
                    </Button>
                </div>
                <SettingItemDesc>
                    {t('panel.settings.discord_bot.status_embed_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.discord_bot.status_embed_note')} <InlineCode>/status add</InlineCode>
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.discord_bot.player_list_embed_label')}>
                <div className="flex flex-wrap gap-6">
                    <Button
                        size={'sm'}
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => {
                            const storedEmbed = pageCtx.apiData?.storedConfigs?.discordBot?.playerListEmbedJson as
                                | string
                                | undefined;
                            const defEmbed = pageCtx.apiData?.defaultConfigs?.discordBot?.playerListEmbedJson as
                                | string
                                | undefined;
                            const storedConfig = pageCtx.apiData?.storedConfigs?.discordBot
                                ?.playerListEmbedConfigJson as string | undefined;
                            const defConfig = pageCtx.apiData?.defaultConfigs?.discordBot?.playerListEmbedConfigJson as
                                | string
                                | undefined;
                            openEmbedEditor({
                                variant: 'playerList',
                                embedJson: storedEmbed ?? defEmbed ?? '{}',
                                embedConfigJson: storedConfig ?? defConfig ?? '{}',
                                initialEmbedJson: storedEmbed ?? defEmbed ?? '{}',
                                initialEmbedConfigJson: storedConfig ?? defConfig ?? '{}',
                                defaultEmbedJson: defEmbed ?? '{}',
                                defaultEmbedConfigJson: defConfig ?? '{}',
                            });
                        }}
                    >
                        <PencilIcon className="mr-1.5 inline-block size-4" />{' '}
                        {t('panel.settings.discord_bot.edit_player_list_embed')}
                    </Button>
                </div>
                <SettingItemDesc>
                    {t('panel.settings.discord_bot.player_list_embed_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.discord_bot.player_list_embed_note')} <InlineCode>/players add</InlineCode>
                </SettingItemDesc>
            </SettingItem>
            <Separator />
            <SettingItem
                label={t('panel.settings.discord_oauth.client_id_label')}
                htmlFor={cfg.oauthClientId.eid}
                showOptional
            >
                <Input
                    id={cfg.oauthClientId.eid}
                    ref={oauthClientIdRef}
                    defaultValue={cfg.oauthClientId.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="000000000000000000"
                />
                <SettingItemDesc>
                    {t('panel.settings.discord_oauth.client_id_desc')} <br />
                    {t('panel.settings.discord_oauth.client_id_portal')}{' '}
                    <TxAnchor href="https://discord.com/developers/applications">Discord Developer Portal</TxAnchor>
                    . <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.discord_oauth.client_id_note')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.discord_oauth.client_secret_label')}
                htmlFor={cfg.oauthClientSecret.eid}
                showOptional
            >
                <Input
                    id={cfg.oauthClientSecret.eid}
                    ref={oauthClientSecretRef}
                    defaultValue={cfg.oauthClientSecret.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    className="blur-input"
                />
                <SettingItemDesc>
                    {t('panel.settings.discord_oauth.client_secret_desc')} <br />
                    <strong>{t('panel.settings.discord_oauth.client_secret_redirect')}</strong>{' '}
                    <InlineCode>{'<your-panel-url>/login/discord/callback'}</InlineCode>
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}

export default function ConfigCardDiscord(props: SettingsCardProps) {
    return useConfigCardDiscord(props);
}
