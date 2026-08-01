import { useLocale } from '@/hooks/locale';
import { useTheme } from '@/hooks/theme';
import { RadioGroup } from '@/components/ui/radio-group';
import BigRadioItem from '@/components/BigRadioItem';
import SettingsCardShell from '../SettingsCardShell';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import type { SettingsCardProps } from '../utils';

/**
 * Theme is stored client-side only (cookie), so this card never has pending
 * changes or a save handler - selecting an option applies it immediately.
 */
export default function ConfigCardAppearance({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const { theme, setTheme } = useTheme();
    const customThemes = window.txConsts.customThemes;

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={() => {}}>
            <SettingItem label={t('panel.settings.appearance.theme.label')}>
                <RadioGroup value={theme} onValueChange={setTheme}>
                    <BigRadioItem
                        groupValue={theme}
                        value="light"
                        title={t('panel.shell.header.theme_light')}
                        desc={t('panel.settings.appearance.theme.light_desc')}
                    />
                    <BigRadioItem
                        groupValue={theme}
                        value="dark"
                        title={t('panel.shell.header.theme_dark')}
                        desc={t('panel.settings.appearance.theme.dark_desc')}
                    />
                    {customThemes.map((customTheme) => (
                        <BigRadioItem
                            key={customTheme.name}
                            groupValue={theme}
                            value={customTheme.name}
                            title={customTheme.name}
                            desc={t(
                                customTheme.isDark
                                    ? 'panel.settings.appearance.theme.custom_dark_desc'
                                    : 'panel.settings.appearance.theme.custom_light_desc',
                            )}
                        />
                    ))}
                </RadioGroup>
                <SettingItemDesc>{t('panel.settings.appearance.theme.desc')}</SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
