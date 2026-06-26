import SwitchText from '@/components/SwitchText';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { getConfigAccessors, getPageConfig, type SettingsCardProps } from '../utils';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/locale';

export const gameReportsPageConfigs = {
    reportsEnabled: getPageConfig('gameFeatures', 'reportsEnabled', undefined, true),
    ticketPriorityEnabled: getPageConfig('gameFeatures', 'ticketPriorityEnabled', undefined, false),
    ticketFeedbackEnabled: getPageConfig('gameFeatures', 'ticketFeedbackEnabled', undefined, true),
    ticketCategories: getPageConfig('gameFeatures', 'ticketCategories', undefined, [
        'Player Report',
        'Bug Report',
        'Question',
        'Other',
    ] as string[]),
    ticketRetentionDays: getPageConfig('gameFeatures', 'ticketRetentionDays', undefined, 30),
    ticketChannelId: getPageConfig('discordBot', 'ticketChannelId', undefined, null as string | null),
} as const;

type GameReportsSettingsFieldsProps = {
    cardId: string;
    cfg: ReturnType<typeof getConfigAccessors<typeof gameReportsPageConfigs>>;
    states: Record<string, unknown>;
    pageCtx: SettingsCardProps['pageCtx'];
    categoriesRef: React.RefObject<HTMLInputElement | null>;
    retentionDaysRef: React.RefObject<HTMLInputElement | null>;
    ticketChannelRef: React.RefObject<HTMLInputElement | null>;
    updatePageState: () => void;
    debouncedUpdatePageState: () => void;
};

export function GameReportsSettingsFields({
    cardId,
    cfg,
    states,
    pageCtx,
    categoriesRef,
    retentionDaysRef,
    ticketChannelRef,
    updatePageState,
    debouncedUpdatePageState,
}: GameReportsSettingsFieldsProps) {
    const { t } = useLocale();

    return (
        <>
            <SettingItem label={t('panel.settings.game_reports.tickets_label')}>
                <SwitchText
                    id={cfg.reportsEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.reportsEnabled as boolean}
                    onCheckedChange={cfg.reportsEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_reports.tickets_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem
                label={t('panel.settings.game_reports.categories_label')}
                htmlFor={`${cardId}-categories`}
                showOptional
            >
                <Input
                    id={`${cardId}-categories`}
                    ref={categoriesRef}
                    placeholder={t('panel.settings.game_reports.categories_placeholder')}
                    onChange={debouncedUpdatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_reports.categories_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_reports.priority_label')}>
                <SwitchText
                    id={cfg.ticketPriorityEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.ticketPriorityEnabled as boolean}
                    onCheckedChange={cfg.ticketPriorityEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_reports.priority_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_reports.feedback_label')}>
                <SwitchText
                    id={cfg.ticketFeedbackEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.ticketFeedbackEnabled as boolean}
                    onCheckedChange={cfg.ticketFeedbackEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_reports.feedback_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem
                label={t('panel.settings.game_reports.retention_label')}
                htmlFor={`${cardId}-retention`}
                showOptional
            >
                <Input
                    id={`${cardId}-retention`}
                    ref={retentionDaysRef}
                    type="number"
                    min={1}
                    max={365}
                    placeholder="30"
                    onChange={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    className="w-24"
                />
                <SettingItemDesc>{t('panel.settings.game_reports.retention_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem
                label={t('panel.settings.game_reports.discord_channel_label')}
                htmlFor={`${cardId}-discordChan`}
                showOptional
            >
                <Input
                    id={`${cardId}-discordChan`}
                    ref={ticketChannelRef}
                    placeholder={t('panel.settings.game_reports.discord_channel_placeholder')}
                    onChange={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_reports.discord_channel_desc')}</SettingItemDesc>
            </SettingItem>
        </>
    );
}
