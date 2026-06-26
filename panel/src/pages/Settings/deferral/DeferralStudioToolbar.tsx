import type { ReactNode } from 'react';
import { useLocale } from '@/hooks/locale';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DEFERRAL_SCENARIO_META } from '@shared/deferralCardTypes';
import type { DeferralAddonScenarioMeta } from '@shared/deferralAddonTypes';
import type { DeferralBlockType } from '@shared/deferralCardLayout';
import { DEFERRAL_CARD_SIZE_PRESETS, type DeferralCardSizePresetId } from '@shared/deferralCardCanvas';
import type { DeferralStudioPrefs } from './deferralStudioPrefs';
import { deferralBlockLabel, deferralScenarioLabel, deferralSizePresetLabel } from './deferralStudioLocale';
import { cn } from '@/lib/utils';
import { Download, Grid3x3, ImageIcon, Magnet, MoreHorizontal, Plus, RotateCcw, Save, Upload } from 'lucide-react';

type DeferralStudioToolbarProps = {
    scenarioId: string | null;
    onScenarioChange: (id: string) => void;
    addonScenarios?: DeferralAddonScenarioMeta[];
    sizePreset: DeferralCardSizePresetId | 'custom';
    cardSize: { width: number; height: number };
    onSizePresetChange: (preset: DeferralCardSizePresetId | 'custom') => void;
    onApplyCardSize: (width: number, height: number, preset: DeferralCardSizePresetId | 'custom') => void;
    addableTypes: DeferralBlockType[];
    onAddBlock: (type: DeferralBlockType) => void;
    showLogo: boolean;
    onShowLogoChange: (checked: boolean) => void;
    studioPrefs: DeferralStudioPrefs;
    onStudioPrefsChange: (patch: Partial<DeferralStudioPrefs>) => void;
    onExportAll: () => void;
    onExportScenario: () => void;
    onImport: () => void;
    onRestoreDefault: () => void;
    onSave: () => void;
    isSaving: boolean;
    isCurrentDirty: boolean;
    dirtyScenarioIds: string[];
    onBack: () => void;
};

function ToolbarToggle({
    label,
    pressed,
    onClick,
    children,
}: {
    label: string;
    pressed: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant={pressed ? 'secondary' : 'ghost'}
                    className={cn('size-8 shrink-0', pressed && 'bg-secondary')}
                    aria-label={label}
                    aria-pressed={pressed}
                    onClick={onClick}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}

export function DeferralStudioToolbar({
    scenarioId,
    onScenarioChange,
    addonScenarios = [],
    sizePreset,
    cardSize,
    onSizePresetChange,
    onApplyCardSize,
    addableTypes,
    onAddBlock,
    showLogo,
    onShowLogoChange,
    studioPrefs,
    onStudioPrefsChange,
    onExportAll,
    onExportScenario,
    onImport,
    onRestoreDefault,
    onSave,
    isSaving,
    isCurrentDirty,
    dirtyScenarioIds,
    onBack,
}: DeferralStudioToolbarProps) {
    const { t } = useLocale();

    return (
        <div className="bg-card/80 flex shrink-0 flex-col gap-2 rounded-xl border p-2 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-2">
                <Select value={scenarioId ?? ''} onValueChange={(v) => onScenarioChange(v)}>
                    <SelectTrigger id="studio-scenario" className="h-8 w-[min(100%,220px)]">
                        <SelectValue placeholder={t('panel.deferral_studio.toolbar.scenario_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectGroup>
                            <SelectLabel>{t('panel.deferral_studio.toolbar.group_core')}</SelectLabel>
                            {DEFERRAL_SCENARIO_META.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                    {deferralScenarioLabel(t, s.id, s.label)}
                                    {dirtyScenarioIds.includes(s.id) ? ' •' : ''}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                        {addonScenarios.length > 0 ? (
                            <SelectGroup>
                                <SelectLabel>{t('panel.deferral_studio.toolbar.group_addons')}</SelectLabel>
                                {addonScenarios.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {deferralScenarioLabel(t, s.id, s.label)}
                                        {dirtyScenarioIds.includes(s.id) ? ' •' : ''}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ) : null}
                    </SelectContent>
                </Select>

                {scenarioId ? (
                    <>
                        <Select
                            value={sizePreset}
                            onValueChange={(v) => {
                                if (v === 'custom') {
                                    onSizePresetChange('custom');
                                    return;
                                }
                                const preset = DEFERRAL_CARD_SIZE_PRESETS[v as DeferralCardSizePresetId];
                                onApplyCardSize(preset.width, preset.height, v as DeferralCardSizePresetId);
                            }}
                        >
                            <SelectTrigger id="studio-card-size" className="h-8 w-[min(100%,160px)]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(
                                    Object.entries(DEFERRAL_CARD_SIZE_PRESETS) as [
                                        DeferralCardSizePresetId,
                                        (typeof DEFERRAL_CARD_SIZE_PRESETS)[DeferralCardSizePresetId],
                                    ][]
                                ).map(([id, preset]) => (
                                    <SelectItem key={id} value={id}>
                                        {deferralSizePresetLabel(t, id)}
                                    </SelectItem>
                                ))}
                                <SelectItem value="custom">{t('panel.deferral_studio.toolbar.size_custom')}</SelectItem>
                            </SelectContent>
                        </Select>

                        {sizePreset === 'custom' ? (
                            <div className="flex items-center gap-1.5">
                                <Input
                                    type="number"
                                    min={320}
                                    max={720}
                                    className="h-8 w-20"
                                    aria-label={t('panel.deferral_studio.toolbar.card_width_aria')}
                                    value={cardSize.width}
                                    onChange={(e) =>
                                        onApplyCardSize(
                                            Number(e.target.value) || cardSize.width,
                                            cardSize.height,
                                            'custom',
                                        )
                                    }
                                />
                                <span className="text-muted-foreground text-xs">×</span>
                                <Input
                                    type="number"
                                    min={120}
                                    max={480}
                                    className="h-8 w-20"
                                    aria-label={t('panel.deferral_studio.toolbar.card_height_aria')}
                                    value={cardSize.height}
                                    onChange={(e) =>
                                        onApplyCardSize(
                                            cardSize.width,
                                            Number(e.target.value) || cardSize.height,
                                            'custom',
                                        )
                                    }
                                />
                            </div>
                        ) : (
                            <span className="text-muted-foreground hidden text-xs sm:inline">
                                {cardSize.width}×{cardSize.height}px
                            </span>
                        )}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button type="button" size="sm" variant="secondary" className="h-8">
                                    <Plus className="mr-1 size-3.5" />
                                    {t('panel.deferral_studio.toolbar.add')}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {addableTypes.map((type) => (
                                    <DropdownMenuItem key={type} onClick={() => onAddBlock(type)}>
                                        {deferralBlockLabel(t, type)}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="bg-border/60 mx-1 hidden h-6 w-px sm:block" />

                        <ToolbarToggle
                            label={t('panel.deferral_studio.toolbar.watermark_logo')}
                            pressed={showLogo}
                            onClick={() => onShowLogoChange(!showLogo)}
                        >
                            <ImageIcon className="size-4" />
                        </ToolbarToggle>
                        <ToolbarToggle
                            label={t('panel.deferral_studio.toolbar.snap_to_grid')}
                            pressed={studioPrefs.snapToGrid}
                            onClick={() => onStudioPrefsChange({ snapToGrid: !studioPrefs.snapToGrid })}
                        >
                            <Magnet className="size-4" />
                        </ToolbarToggle>
                        <ToolbarToggle
                            label={t('panel.deferral_studio.toolbar.show_grid')}
                            pressed={studioPrefs.showGrid}
                            onClick={() => onStudioPrefsChange({ showGrid: !studioPrefs.showGrid })}
                        >
                            <Grid3x3 className="size-4" />
                        </ToolbarToggle>
                    </>
                ) : null}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" size="sm" variant="outline" className="h-8">
                                <MoreHorizontal className="mr-1 size-3.5" />
                                {t('panel.deferral_studio.toolbar.file')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={onExportAll}>
                                <Download className="mr-2 size-4" />
                                {t('panel.deferral_studio.toolbar.export_all')}
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={!scenarioId} onClick={onExportScenario}>
                                <Download className="mr-2 size-4" />
                                {t('panel.deferral_studio.toolbar.export_scenario')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem disabled={!scenarioId} onClick={onRestoreDefault}>
                                <RotateCcw className="mr-2 size-4" />
                                {t('panel.deferral_studio.toolbar.restore_default')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onSelect={(e) => {
                                    e.preventDefault();
                                    onImport();
                                }}
                            >
                                <Upload className="mr-2 size-4" />
                                {t('panel.deferral_studio.toolbar.import')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        onClick={onSave}
                        disabled={isSaving || !scenarioId || !isCurrentDirty}
                    >
                        <Save className="mr-1.5 size-3.5" />
                        {isCurrentDirty
                            ? t('panel.deferral_studio.toolbar.save_card')
                            : t('panel.deferral_studio.toolbar.saved')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={onBack}>
                        {t('panel.deferral_studio.toolbar.back')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
