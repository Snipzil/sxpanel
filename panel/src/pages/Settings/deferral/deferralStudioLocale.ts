import type { DeferralCardSizePresetId } from '@shared/deferralCardCanvas';
import type { DeferralBlockType } from '@shared/deferralCardLayout';

export type LocaleT = (key: string, tOptions?: Record<string, string | number>, defaultValue?: string) => string;

export function deferralBlockLabel(t: LocaleT, type: DeferralBlockType): string {
    return t(`panel.deferral_studio.blocks.${type}.label`);
}

export function deferralBlockDescription(t: LocaleT, type: DeferralBlockType): string {
    return t(`panel.deferral_studio.blocks.${type}.description`);
}

export function deferralBlockDefaultContent(t: LocaleT, type: DeferralBlockType): string {
    return t(`panel.deferral_studio.blocks.${type}.default_content`, undefined, '');
}

export function deferralScenarioLabel(t: LocaleT, id: string, fallback?: string): string {
    return t(`panel.deferral_studio.scenarios.${id}.label`, undefined, fallback ?? id);
}

export function deferralScenarioDescription(t: LocaleT, id: string, fallback?: string): string {
    return t(`panel.deferral_studio.scenarios.${id}.description`, undefined, fallback ?? '');
}

export function deferralSizePresetLabel(t: LocaleT, id: DeferralCardSizePresetId): string {
    return t(`panel.deferral_studio.size_presets.${id}`);
}
