import SwitchText from '@/components/SwitchText';
import type { GetConfigsResp } from '@shared/otherTypes';
import type { SettingsPageContext } from './utils';

const GENERAL_CARD_CTX = {
    tabId: 'general',
    tabName: 'General',
    cardId: 'general',
    cardName: 'General',
    cardTitle: 'General',
} as const;

function readEnableTelemetry(apiData: GetConfigsResp | undefined): boolean {
    const stored = apiData?.storedConfigs?.general?.enableTelemetry;
    if (typeof stored === 'boolean') return stored;
    const defaults = apiData?.defaultConfigs?.general?.enableTelemetry;
    if (typeof defaults === 'boolean') return defaults;
    return true;
}

export function TelemetryOptOutCard({
    pageCtx,
    disabled,
    t,
}: {
    pageCtx?: SettingsPageContext;
    disabled: boolean;
    t: (key: string) => string;
}) {
    if (!pageCtx) return null;

    const enableTelemetry = readEnableTelemetry(pageCtx.apiData);
    const optedOut = !enableTelemetry;
    const switchDisabled = disabled || pageCtx.isReadOnly || pageCtx.isLoading;

    const handleOptOutChange = (nextOptedOut: boolean) => {
        if (switchDisabled) return;
        void pageCtx.saveChanges(GENERAL_CARD_CTX, {
            general: { enableTelemetry: !nextOptedOut },
        });
    };

    return (
        <div className="border-border/60 bg-card rounded-xl border">
            <div className="border-border/40 border-b px-5 py-3">
                <h3 className="font-semibold">{t('panel.settings.danger_zone.telemetry_title')}</h3>
                <p className="text-muted-foreground text-sm">{t('panel.settings.danger_zone.telemetry_desc')}</p>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <label htmlFor="telemetry-opt-out" className="text-sm font-medium">
                    {t('panel.settings.danger_zone.telemetry_opt_out_label')}
                </label>
                <SwitchText
                    id="telemetry-opt-out"
                    checked={optedOut}
                    onCheckedChange={handleOptOutChange}
                    disabled={switchDisabled}
                    checkedLabel={t('panel.settings.danger_zone.telemetry_opted_out')}
                    uncheckedLabel={t('panel.settings.danger_zone.telemetry_collecting')}
                />
            </div>
        </div>
    );
}
