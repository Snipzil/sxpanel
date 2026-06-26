import TxAnchor from '@/components/TxAnchor';
import SwitchText from '@/components/SwitchText';
import InlineCode from '@/components/InlineCode';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { getConfigAccessors, getPageConfig, type SettingsCardProps } from '../utils';
import { useLocale } from '@/hooks/locale';

export const gameNotificationsPageConfigs = {
    hideAdminInPunishments: getPageConfig('gameFeatures', 'hideAdminInPunishments', undefined, true),
    hideAdminInMessages: getPageConfig('gameFeatures', 'hideAdminInMessages', undefined, false),
    hideDefaultAnnouncement: getPageConfig('gameFeatures', 'hideDefaultAnnouncement', undefined, false),
    hideDefaultDirectMessage: getPageConfig('gameFeatures', 'hideDefaultDirectMessage', undefined, false),
    hideDefaultWarning: getPageConfig('gameFeatures', 'hideDefaultWarning', undefined, false),
    hideScheduledRestartWarnings: getPageConfig('gameFeatures', 'hideDefaultScheduledRestartWarning', undefined, false),
} as const;

type GameNotificationsSettingsFieldsProps = {
    cfg: ReturnType<typeof getConfigAccessors<typeof gameNotificationsPageConfigs>>;
    states: Record<string, unknown>;
    pageCtx: SettingsCardProps['pageCtx'];
};

export function GameNotificationsSettingsFields({ cfg, states, pageCtx }: GameNotificationsSettingsFieldsProps) {
    const { t } = useLocale();

    return (
        <>
            <SettingItem label={t('panel.settings.game_notifications.hide_admin_punishments')}>
                <SwitchText
                    id={cfg.hideAdminInPunishments.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideAdminInPunishments as boolean}
                    onCheckedChange={cfg.hideAdminInPunishments.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_admin_punishments_desc')} <br />
                    {t('panel.settings.game_notifications.hide_admin_punishments_note')}
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_notifications.hide_admin_messages')}>
                <SwitchText
                    id={cfg.hideAdminInMessages.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideAdminInMessages as boolean}
                    onCheckedChange={cfg.hideAdminInMessages.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_admin_messages_desc')} <br />
                    {t('panel.settings.game_notifications.hide_admin_messages_note')}
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_notifications.hide_announcement_label')}>
                <SwitchText
                    id={cfg.hideDefaultAnnouncement.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideDefaultAnnouncement as boolean}
                    onCheckedChange={cfg.hideDefaultAnnouncement.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_announcement_desc')}{' '}
                    <InlineCode>txAdmin:events:announcement</InlineCode>.{' '}
                    <TxAnchor href="https://aka.cfx.re/txadmin-events#txadmineventsannouncement">
                        {t('panel.settings.game_notifications.documentation_link')}
                    </TxAnchor>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_notifications.hide_dm_label')}>
                <SwitchText
                    id={cfg.hideDefaultDirectMessage.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideDefaultDirectMessage as boolean}
                    onCheckedChange={cfg.hideDefaultDirectMessage.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_dm_desc')}{' '}
                    <InlineCode>txAdmin:events:playerDirectMessage</InlineCode>.{' '}
                    <TxAnchor href="https://aka.cfx.re/txadmin-events#txadmineventsplayerdirectmessage">
                        {t('panel.settings.game_notifications.documentation_link')}
                    </TxAnchor>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_notifications.hide_warning_label')}>
                <SwitchText
                    id={cfg.hideDefaultWarning.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideDefaultWarning as boolean}
                    onCheckedChange={cfg.hideDefaultWarning.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_warning_desc')}{' '}
                    <InlineCode>txAdmin:events:playerWarned</InlineCode>.{' '}
                    <TxAnchor href="https://aka.cfx.re/txadmin-events#txadmineventsplayerwarned">
                        {t('panel.settings.game_notifications.documentation_link')}
                    </TxAnchor>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_notifications.hide_restart_label')}>
                <SwitchText
                    id={cfg.hideScheduledRestartWarnings.eid}
                    checkedLabel={t('panel.settings.switch.hidden')}
                    uncheckedLabel={t('panel.settings.switch.visible')}
                    checked={states.hideScheduledRestartWarnings as boolean}
                    onCheckedChange={cfg.hideScheduledRestartWarnings.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_notifications.hide_restart_desc')}{' '}
                    <InlineCode>txAdmin:events:scheduledRestart</InlineCode>.{' '}
                    <TxAnchor href="https://aka.cfx.re/txadmin-events#txadmineventsscheduledrestart">
                        {t('panel.settings.game_notifications.documentation_link')}
                    </TxAnchor>
                </SettingItemDesc>
            </SettingItem>
        </>
    );
}
