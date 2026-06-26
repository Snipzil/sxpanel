import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useEffect, useMemo, useReducer, useRef } from 'react';
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
import { PlusIcon, TrashIcon } from 'lucide-react';
import { AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import { Switch } from '@/components/ui/switch';
import { useLocale } from '@/hooks/locale';
import { DiscordRoleMultiSelect } from '@/components/DiscordRoleMultiSelect';
import { isValidDiscordSnowflake } from '@/lib/discordRoleIds';
import { txToast } from '@/components/TxToaster';

type CustomTagEntry = {
    id: string;
    label: string;
    prefix?: string;
    color: string;
    priority: number;
    enabled?: boolean;
    discordRoleIds?: string[];
};

const autoTagDefinitionsById = new Map(AUTO_TAG_DEFINITIONS.map((definition) => [definition.id, definition] as const));

const AUTO_TAG_IDS = new Set(AUTO_TAG_DEFINITIONS.map((t) => t.id));

export const pageConfigs = {
    newplayerThreshold: getPageConfig('gameFeatures', 'newplayerThreshold', undefined, 240),
    customTags: getPageConfig('gameFeatures', 'customTags', undefined, [] as CustomTagEntry[]),
} as const;

/**
 * Merges auto-tag defaults with stored customTags entries.
 * Auto-tags always appear first (in their default order), with stored overrides applied.
 * Custom (non-auto) tags follow after.
 */
const buildMergedTags = (stored: CustomTagEntry[]): CustomTagEntry[] => {
    const storedMap = new Map(stored.map((t) => [t.id, t]));
    const merged: CustomTagEntry[] = [];
    for (const auto of AUTO_TAG_DEFINITIONS) {
        const storedOverride = storedMap.get(auto.id);
        merged.push(
            storedOverride
                ? { ...auto, ...storedOverride, enabled: storedOverride.enabled ?? true }
                : { ...auto, enabled: true },
        );
        storedMap.delete(auto.id);
    }
    for (const custom of storedMap.values()) {
        merged.push(custom);
    }
    return merged;
};

/**
 * Extracts only changed/custom entries to store back in config.
 * Auto-tags that match their defaults are excluded.
 */
const extractStoredTags = (merged: CustomTagEntry[]): CustomTagEntry[] => {
    const result: CustomTagEntry[] = [];
    for (const tag of merged) {
        const autoDef = autoTagDefinitionsById.get(tag.id);
        if (autoDef) {
            const isChanged =
                tag.color !== autoDef.color ||
                tag.priority !== autoDef.priority ||
                tag.label !== autoDef.label ||
                tag.prefix !== autoDef.prefix ||
                tag.enabled === false;
            if (isChanged) {
                result.push(tag);
            }
        } else {
            const entry: CustomTagEntry = {
                id: tag.id,
                label: tag.label,
                color: tag.color,
                priority: tag.priority,
            };
            if (tag.prefix !== undefined && tag.prefix !== '') {
                entry.prefix = tag.prefix;
            }
            if (tag.discordRoleIds?.length) {
                entry.discordRoleIds = tag.discordRoleIds;
            }
            result.push(entry);
        }
    }
    return result;
};

export default function ConfigCardGamePlayerTags({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const thresholdRef = useRef<HTMLInputElement | null>(null);

    const autoTagDescriptions: Record<string, string> = {
        staff: t('panel.settings.player_tags.auto_tag_staff'),
        problematic: t('panel.settings.player_tags.auto_tag_problematic'),
        newplayer: t('panel.settings.player_tags.auto_tag_newplayer'),
    };

    // Merged view: auto-tags + custom tags
    const mergedTags = useMemo(() => buildMergedTags(states.customTags ?? []), [states.customTags]);

    //Effects - handle changes
    useEffect(() => {
        updatePageState();
    }, [states]);

    //Processes the state of the page and sets the card as pending save if needed
    const updatePageState = () => {
        const thresholdVal = thresholdRef.current?.value;
        const overwrites: Record<string, unknown> = {};
        if (thresholdVal !== undefined) {
            const parsed = parseInt(thresholdVal, 10);
            overwrites.newplayerThreshold = isNaN(parsed) ? 0 : parsed;
        }

        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, res.hasChanges));
        return res;
    };

    const validateTags = (tags: CustomTagEntry[]): boolean => {
        const seenIds = new Set<string>();
        for (const tag of tags) {
            if (!AUTO_TAG_IDS.has(tag.id)) {
                if (!tag.id.trim()) {
                    txToast.error(t('panel.settings.player_tags.toast_missing_id'));
                    return false;
                }
                if (!tag.label.trim()) {
                    txToast.error(t('panel.settings.player_tags.toast_missing_label', { tagId: tag.id }));
                    return false;
                }
            }
            if (tag.id && seenIds.has(tag.id)) {
                txToast.error(t('panel.settings.player_tags.toast_duplicate_id', { tagId: tag.id }));
                return false;
            }
            if (tag.id) {
                seenIds.add(tag.id);
            }
            if (tag.discordRoleIds?.length) {
                const invalidRoleId = tag.discordRoleIds.find((roleId) => !isValidDiscordSnowflake(roleId));
                if (invalidRoleId) {
                    txToast.error(t('panel.settings.player_tags.toast_invalid_role_id', { roleId: invalidRoleId }));
                    return false;
                }
            }
        }
        return true;
    };

    //Validate changes and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        const storedTags = extractStoredTags(mergedTags);
        if (!validateTags(mergedTags)) return;

        pageCtx.saveChanges(cardCtx, {
            ...localConfigs,
            gameFeatures: {
                ...(localConfigs.gameFeatures ?? {}),
                customTags: storedTags,
            },
        });
    };

    // Update a tag in the merged view and sync back to stored config
    const updateMergedTag = (
        index: number,
        field: keyof CustomTagEntry,
        value: string | number | boolean | string[],
    ) => {
        const updated = [...mergedTags];
        updated[index] = { ...updated[index], [field]: value };
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const addTag = () => {
        const customCount = mergedTags.filter((tag) => !AUTO_TAG_IDS.has(tag.id)).length;
        if (customCount >= 20) return;
        const allPriorities = mergedTags.map((tag) => tag.priority);
        const nextPriority = Math.min(Math.max(...allPriorities, 0) + 10, 999);
        const updated = [...mergedTags, { id: '', label: '', prefix: '', color: '#3B82F6', priority: nextPriority }];
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const removeTag = (index: number) => {
        const updated = mergedTags.filter((_, i) => i !== index);
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const customCount = mergedTags.filter((tag) => !AUTO_TAG_IDS.has(tag.id)).length;
    const discordBotEnabled = pageCtx.apiData?.storedConfigs.discordBot?.enabled ?? false;

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label={t('panel.settings.player_tags.threshold_label')} htmlFor={cfg.newplayerThreshold.eid}>
                <Input
                    id={cfg.newplayerThreshold.eid}
                    ref={thresholdRef}
                    type="number"
                    min={0}
                    defaultValue={cfg.newplayerThreshold.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="240"
                />
                <SettingItemDesc>{t('panel.settings.player_tags.threshold_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.player_tags.tags_label')}>
                <div className="space-y-3">
                    {mergedTags.map((tag, i) => {
                        const isAutoTag = AUTO_TAG_IDS.has(tag.id);
                        const isDisabled = isAutoTag && tag.enabled === false;
                        const tagKey = isAutoTag ? tag.id : `custom-${i}`;
                        return (
                            <div
                                key={tagKey}
                                className={`flex flex-wrap items-end gap-2 rounded-md border p-3 ${isDisabled ? 'opacity-50' : ''}`}
                                style={{ borderColor: tag.color ? `${tag.color}40` : undefined }}
                            >
                                <div className="w-32 space-y-1">
                                    <label className="text-muted-foreground text-xs" htmlFor={`${tagKey}-id`}>
                                        {t('panel.settings.player_tags.field_id')}
                                    </label>
                                    <Input
                                        id={`${tagKey}-id`}
                                        value={tag.id}
                                        onChange={(e) =>
                                            updateMergedTag(
                                                i,
                                                'id',
                                                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                                            )
                                        }
                                        placeholder="streamer"
                                        disabled={pageCtx.isReadOnly || isAutoTag}
                                        maxLength={32}
                                    />
                                </div>
                                <div className="w-32 space-y-1">
                                    <label className="text-muted-foreground text-xs" htmlFor={`${tagKey}-label`}>
                                        {t('panel.settings.player_tags.field_label')}
                                    </label>
                                    <Input
                                        id={`${tagKey}-label`}
                                        value={tag.label}
                                        onChange={(e) => updateMergedTag(i, 'label', e.target.value)}
                                        placeholder="Streamer"
                                        disabled={pageCtx.isReadOnly}
                                        maxLength={24}
                                    />
                                </div>
                                <div className="w-24 space-y-1">
                                    <label className="text-muted-foreground text-xs" htmlFor={`${tagKey}-prefix`}>
                                        {t('panel.settings.player_tags.field_prefix')}
                                    </label>
                                    <Input
                                        id={`${tagKey}-prefix`}
                                        value={tag.prefix ?? ''}
                                        onChange={(e) => updateMergedTag(i, 'prefix', e.target.value)}
                                        placeholder="[S] "
                                        disabled={pageCtx.isReadOnly}
                                        maxLength={16}
                                    />
                                </div>
                                <div className="w-20 space-y-1">
                                    <label className="text-muted-foreground text-xs" htmlFor={`${tagKey}-color`}>
                                        {t('panel.settings.player_tags.field_color')}
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            id={`${tagKey}-color`}
                                            type="color"
                                            value={tag.color}
                                            onChange={(e) => updateMergedTag(i, 'color', e.target.value)}
                                            disabled={pageCtx.isReadOnly}
                                            className="size-9 cursor-pointer rounded border-0 bg-transparent p-0"
                                        />
                                        <span className="text-muted-foreground font-mono text-xs">{tag.color}</span>
                                    </div>
                                </div>
                                <div className="w-20 space-y-1">
                                    <label className="text-muted-foreground text-xs" htmlFor={`${tagKey}-priority`}>
                                        {t('panel.settings.player_tags.field_priority')}
                                    </label>
                                    <Input
                                        id={`${tagKey}-priority`}
                                        type="number"
                                        min={1}
                                        max={999}
                                        value={tag.priority}
                                        onChange={(e) =>
                                            updateMergedTag(i, 'priority', parseInt(e.target.value, 10) || 1)
                                        }
                                        disabled={pageCtx.isReadOnly}
                                    />
                                </div>
                                {isAutoTag ? (
                                    <div className="flex h-9 shrink-0 items-center gap-2">
                                        <Switch
                                            checked={tag.enabled !== false}
                                            onCheckedChange={(checked) => updateMergedTag(i, 'enabled', checked)}
                                            disabled={pageCtx.isReadOnly}
                                        />
                                        <span className="text-muted-foreground text-xs">
                                            {tag.enabled !== false
                                                ? t('panel.settings.switch.enabled')
                                                : t('panel.settings.switch.disabled')}
                                        </span>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="text-destructive-inline size-9 shrink-0"
                                        onClick={() => removeTag(i)}
                                        disabled={pageCtx.isReadOnly}
                                    >
                                        <TrashIcon className="size-4" />
                                    </Button>
                                )}
                                {isAutoTag && autoTagDescriptions[tag.id] && (
                                    <p className="text-muted-foreground w-full text-xs">
                                        {autoTagDescriptions[tag.id]}
                                    </p>
                                )}
                                {!isAutoTag && (
                                    <div className="w-full space-y-1">
                                        <label
                                            className="text-muted-foreground text-xs"
                                            htmlFor={`${tagKey}-discord-roles`}
                                        >
                                            {t('panel.settings.player_tags.discord_roles_label')}
                                        </label>
                                        <DiscordRoleMultiSelect
                                            id={`${tagKey}-discord-roles`}
                                            value={tag.discordRoleIds ?? []}
                                            onChange={(roleIds) => updateMergedTag(i, 'discordRoleIds', roleIds)}
                                            disabled={pageCtx.isReadOnly || !discordBotEnabled}
                                        />
                                        <SettingItemDesc>
                                            {t('panel.settings.player_tags.discord_roles_desc')}
                                        </SettingItemDesc>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={addTag}
                        disabled={pageCtx.isReadOnly || customCount >= 20}
                    >
                        <PlusIcon className="mr-1 size-4" />
                        {t('panel.settings.player_tags.add_tag')}
                    </Button>
                </div>
                <SettingItemDesc>{t('panel.settings.player_tags.tags_desc')}</SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
