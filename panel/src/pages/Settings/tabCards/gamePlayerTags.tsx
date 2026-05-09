import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useState, useEffect, useMemo, useReducer, useRef } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { PlusIcon, TrashIcon } from 'lucide-react';
import { AUTO_TAG_DEFINITIONS } from '@shared/socketioTypes';
import { Switch } from '@/components/ui/switch';

type CustomTagEntry = {
    id: string;
    label: string;
    color: string;
    priority: number;
    enabled?: boolean;
};

const AUTO_TAG_IDS = new Set(AUTO_TAG_DEFINITIONS.map((t) => t.id));

const AUTO_TAG_DESCRIPTIONS: Record<string, string> = {
    staff: 'Shown on anyone who has an fxPanel admin account.',
    problematic: 'Shown on anyone with an active (non-revoked) ban or warning.',
    newplayer: 'Shown on anyone with less than the threshold minutes of total playtime.',
};

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
        merged.push(storedOverride ?? { ...auto, enabled: true });
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
        const autoDef = AUTO_TAG_DEFINITIONS.find((a) => a.id === tag.id);
        if (autoDef) {
            const isChanged =
                tag.color !== autoDef.color ||
                tag.priority !== autoDef.priority ||
                tag.label !== autoDef.label ||
                tag.enabled === false;
            if (isChanged) {
                result.push(tag);
            }
        } else {
            result.push(tag);
        }
    }
    return result;
};

export default function ConfigCardGamePlayerTags({ cardCtx, pageCtx }: SettingsCardProps) {
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const thresholdRef = useRef<HTMLInputElement | null>(null);

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
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    };

    //Validate changes (for UX only) and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    // Update a tag in the merged view and sync back to stored config
    const updateMergedTag = (index: number, field: keyof CustomTagEntry, value: string | number | boolean) => {
        const updated = [...mergedTags];
        updated[index] = { ...updated[index], [field]: value };
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const addTag = () => {
        const customCount = mergedTags.filter((t) => !AUTO_TAG_IDS.has(t.id)).length;
        if (customCount >= 20) return;
        const allPriorities = mergedTags.map((t) => t.priority);
        const nextPriority = Math.min(Math.max(...allPriorities, 0) + 10, 999);
        const updated = [...mergedTags, { id: '', label: '', color: '#3B82F6', priority: nextPriority }];
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const removeTag = (index: number) => {
        const updated = mergedTags.filter((_, i) => i !== index);
        cfg.customTags.state.set(extractStoredTags(updated));
    };

    const customCount = mergedTags.filter((t) => !AUTO_TAG_IDS.has(t.id)).length;

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label="New Player Threshold" htmlFor={cfg.newplayerThreshold.eid}>
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
                <SettingItemDesc>
                    Players with less than this many minutes of total playtime will receive the{' '}
                    <strong>Newcomer</strong> tag. Set to <strong>0</strong> to disable.
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Tags">
                <div className="space-y-3">
                    {mergedTags.map((tag, i) => {
                        const isAutoTag = AUTO_TAG_IDS.has(tag.id);
                        const isDisabled = isAutoTag && tag.enabled === false;
                        return (
                            <div
                                key={isAutoTag ? tag.id : `custom-${i}`}
                                className={`flex flex-wrap items-end gap-2 rounded-md border p-3 ${isDisabled ? 'opacity-50' : ''}`}
                                style={{ borderColor: tag.color ? `${tag.color}40` : undefined }}
                            >
                                <div className="w-32 space-y-1">
                                    <label className="text-muted-foreground text-xs">ID</label>
                                    <Input
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
                                    <label className="text-muted-foreground text-xs">Label</label>
                                    <Input
                                        value={tag.label}
                                        onChange={(e) => updateMergedTag(i, 'label', e.target.value)}
                                        placeholder="Streamer"
                                        disabled={pageCtx.isReadOnly}
                                        maxLength={24}
                                    />
                                </div>
                                <div className="w-20 space-y-1">
                                    <label className="text-muted-foreground text-xs">Color</label>
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="color"
                                            value={tag.color}
                                            onChange={(e) => updateMergedTag(i, 'color', e.target.value)}
                                            disabled={pageCtx.isReadOnly}
                                            className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                                        />
                                        <span className="text-muted-foreground font-mono text-xs">{tag.color}</span>
                                    </div>
                                </div>
                                <div className="w-20 space-y-1">
                                    <label className="text-muted-foreground text-xs">Priority</label>
                                    <Input
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
                                            {tag.enabled !== false ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="text-destructive-inline h-9 w-9 shrink-0"
                                        onClick={() => removeTag(i)}
                                        disabled={pageCtx.isReadOnly}
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </Button>
                                )}
                                {isAutoTag && AUTO_TAG_DESCRIPTIONS[tag.id] && (
                                    <p className="text-muted-foreground w-full text-xs">
                                        {AUTO_TAG_DESCRIPTIONS[tag.id]}
                                    </p>
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
                        <PlusIcon className="mr-1 h-4 w-4" />
                        Add Tag
                    </Button>
                </div>
                <SettingItemDesc>
                    Built-in tags (Staff, Problematic, Newcomer) can be enabled/disabled and customized (label, color,
                    priority) but cannot be deleted. Define up to 20 additional custom tags for identifying players
                    (e.g. Streamer, VIP). Tags are assigned via resource exports:{' '}
                    <strong>exports.txadmin:addPlayerTag(serverId, tagId)</strong> and{' '}
                    <strong>exports.txadmin:removePlayerTag(serverId, tagId)</strong>. Lower priority number = higher
                    importance (1 is highest priority, 100 is lowest).
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
