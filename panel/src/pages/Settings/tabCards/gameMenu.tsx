import { Input } from '@/components/ui/input';
import SwitchText from '@/components/SwitchText';
import InlineCode from '@/components/InlineCode';
import { AdvancedDivider, SettingItem, SettingItemDesc } from '../settingsItems';
import type { SettingsCardProps } from '../utils';
import { getConfigAccessors, getPageConfig } from '../utils';
import { useLocale } from '@/hooks/locale';

export const gameMenuPageConfigs = {
    menuEnabled: getPageConfig('gameFeatures', 'menuEnabled', undefined, true),
    alignRight: getPageConfig('gameFeatures', 'menuAlignRight', undefined, false),
    pageKey: getPageConfig('gameFeatures', 'menuPageKey'),
    playerIdDistance: getPageConfig('gameFeatures', 'menuPlayerIdDistance', undefined, 150),
    overheadTwoRowLayout: getPageConfig('gameFeatures', 'overheadTwoRowLayout', undefined, true),
    overheadSeatIcons: getPageConfig('gameFeatures', 'overheadSeatIcons', undefined, true),
    overheadNoclipIcon: getPageConfig('gameFeatures', 'overheadNoclipIcon', undefined, true),
    playerModePtfx: getPageConfig('gameFeatures', 'playerModePtfx', true, true),
} as const;

type GameMenuSettingsFieldsProps = {
    cfg: ReturnType<typeof getConfigAccessors<typeof gameMenuPageConfigs>>;
    states: Record<string, unknown>;
    pageCtx: SettingsCardProps['pageCtx'];
    showAdvanced: boolean;
    playerIdDistanceRef: React.RefObject<HTMLInputElement | null>;
    updatePageState: () => void;
    handlePageKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function GameMenuSettingsFields({
    cfg,
    states,
    pageCtx,
    showAdvanced,
    playerIdDistanceRef,
    updatePageState,
    handlePageKey,
}: GameMenuSettingsFieldsProps) {
    const { t } = useLocale();

    return (
        <>
            <SettingItem label={t('panel.settings.game_menu.menu_label')}>
                <SwitchText
                    id={cfg.menuEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.menuEnabled as boolean}
                    onCheckedChange={cfg.menuEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_menu.menu_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.game_menu.align_right_label')}>
                <SwitchText
                    id={cfg.alignRight.eid}
                    checkedLabel={t('panel.settings.game_menu.align_right_on')}
                    uncheckedLabel={t('panel.settings.game_menu.align_right_off')}
                    checked={states.alignRight as boolean}
                    onCheckedChange={cfg.alignRight.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_menu.align_right_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.game_menu.page_key_label')} htmlFor={cfg.pageKey.eid} required>
                <Input
                    id={cfg.pageKey.eid}
                    value={states.pageKey as string}
                    placeholder={t('panel.settings.game_menu.page_key_placeholder')}
                    onKeyDown={handlePageKey}
                    className="font-mono"
                    readOnly
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_menu.page_key_desc')} <br />
                    {t('panel.settings.game_menu.page_key_desc_click')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong>{' '}
                    {t('panel.settings.game_menu.page_key_note_prefix')} <InlineCode>Tab</InlineCode>,{' '}
                    {t('panel.settings.game_menu.page_key_note_mid')} <InlineCode>Escape</InlineCode>{' '}
                    {t('panel.settings.game_menu.page_key_note_or')} <InlineCode>Backspace</InlineCode>.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.game_menu.player_id_distance_label')}
                htmlFor={cfg.playerIdDistance.eid}
            >
                <Input
                    id={cfg.playerIdDistance.eid}
                    ref={playerIdDistanceRef}
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={cfg.playerIdDistance.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    className="w-24"
                    placeholder="150"
                />
                <SettingItemDesc>{t('panel.settings.game_menu.player_id_distance_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_menu.overhead_two_row_label')}>
                <SwitchText
                    id={cfg.overheadTwoRowLayout.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.overheadTwoRowLayout as boolean}
                    onCheckedChange={cfg.overheadTwoRowLayout.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_menu.overhead_two_row_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_menu.overhead_seat_icons_label')}>
                <SwitchText
                    id={cfg.overheadSeatIcons.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.overheadSeatIcons as boolean}
                    onCheckedChange={cfg.overheadSeatIcons.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_menu.overhead_seat_icons_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.game_menu.overhead_noclip_icon_label')}>
                <SwitchText
                    id={cfg.overheadNoclipIcon.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.overheadNoclipIcon as boolean}
                    onCheckedChange={cfg.overheadNoclipIcon.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>{t('panel.settings.game_menu.overhead_noclip_icon_desc')}</SettingItemDesc>
            </SettingItem>

            {showAdvanced && <AdvancedDivider />}

            <SettingItem label={t('panel.settings.game_menu.player_mode_effect_label')} showIf={showAdvanced}>
                <SwitchText
                    id={cfg.playerModePtfx.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    variant="checkedGreen"
                    checked={states.playerModePtfx as boolean}
                    onCheckedChange={cfg.playerModePtfx.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.game_menu.player_mode_effect_desc')} <br />
                    <strong className="text-warning-inline">{t('panel.settings.fxserver.warning_label')}</strong>{' '}
                    {t('panel.settings.game_menu.player_mode_effect_warning')}
                </SettingItemDesc>
            </SettingItem>
        </>
    );
}
