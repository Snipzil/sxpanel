import useSWR from 'swr';
import { Link } from 'wouter';
import { customAlphabet } from 'nanoid';
import { alphanumeric } from 'nanoid-dictionary';
import { CopyIcon, PaletteIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useLocale } from '@/hooks/locale';
import { useTheme } from '@/hooks/theme';
import { RadioGroup } from '@/components/ui/radio-group';
import BigRadioItem from '@/components/BigRadioItem';
import { Button } from '@/components/ui/button';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import type { CustomThemeDataType, GetCustomThemesSuccessResp, SaveCustomThemesReq } from '@shared/otherTypes';
import SettingsCardShell from '../SettingsCardShell';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import type { SettingsCardProps } from '../utils';

const genThemeId = customAlphabet(alphanumeric, 21);

//A handful of representative tokens for the mini swatch strip on each theme card
const SWATCH_KEYS = ['background', 'card', 'accent', 'destructive', 'warning', 'success'] as const;

/**
 * Theme selection is stored client-side only (cookie), so this card never has
 * pending changes or a save handler - selecting an option applies it immediately.
 * Custom theme management (create/edit/duplicate/remove) hits its own API and
 * is handled below the picker.
 */
export default function ConfigCardAppearance({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const { theme, setTheme } = useTheme();
    const openConfirmDialog = useOpenConfirmDialog();
    const customThemes = window.txConsts.customThemes;

    const queryApi = useBackendApi<GetCustomThemesSuccessResp>({
        method: 'GET',
        path: '/settings/customThemes',
        throwGenericErrors: true,
    });
    const saveApi = useBackendApi<{ success?: boolean; error?: string }, SaveCustomThemesReq>({
        method: 'POST',
        path: '/settings/customThemes',
        throwGenericErrors: true,
    });
    const swr = useSWR<CustomThemeDataType[]>('/settings/customThemes', async () => {
        const data = await queryApi({});
        if (!data) throw new Error('No data returned');
        return data;
    });

    const handleDuplicate = async (source: CustomThemeDataType) => {
        const dup: CustomThemeDataType = {
            ...source,
            id: genThemeId(),
            name: t('panel.theme_studio.duplicate_suffix', { name: source.name }),
        };
        const nextList = [...(swr.data ?? []), dup];
        try {
            const resp = await saveApi({ data: nextList });
            if (!resp || resp.error) {
                txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: resp?.error ?? '' });
                return;
            }
            await swr.mutate(nextList, false);
            txToast.success({ title: t('panel.theme_studio.saved_title'), msg: dup.name });
        } catch {
            txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: '' });
        }
    };

    const handleRemove = (target: CustomThemeDataType) => {
        openConfirmDialog({
            title: t('panel.theme_studio.remove_confirm_title'),
            message: t('panel.theme_studio.remove_confirm_message'),
            actionLabel: t('panel.theme_studio.remove'),
            confirmBtnVariant: 'destructive',
            onConfirm: async () => {
                const nextList = (swr.data ?? []).filter((th) => th.id !== target.id);
                try {
                    const resp = await saveApi({ data: nextList });
                    if (!resp || resp.error) {
                        txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: resp?.error ?? '' });
                        return;
                    }
                    await swr.mutate(nextList, false);
                    txToast.success({ title: t('panel.theme_studio.removed_title'), msg: target.name });
                } catch {
                    txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: '' });
                }
            },
        });
    };

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
                            key={customTheme.id}
                            groupValue={theme}
                            value={customTheme.id}
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

            <SettingItem label={t('panel.theme_studio.manage_label')}>
                <SettingItemDesc className="mb-2">{t('panel.theme_studio.manage_desc')}</SettingItemDesc>
                <div className="space-y-2">
                    {swr.data?.length ? (
                        swr.data.map((customTheme) => (
                            <div
                                key={customTheme.id}
                                className="border-border/60 bg-card/40 flex items-center gap-3 rounded-lg border p-2.5"
                            >
                                <div className="flex shrink-0 gap-1">
                                    {SWATCH_KEYS.map((key) => (
                                        <span
                                            key={key}
                                            className="border-border/50 size-4 rounded-full border"
                                            style={{ backgroundColor: `hsl(${customTheme.style[key]})` }}
                                        />
                                    ))}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-foreground truncate text-sm font-medium">{customTheme.name}</p>
                                    <p className="text-muted-foreground text-xs">
                                        {customTheme.isDark
                                            ? t('panel.theme_studio.dark_badge')
                                            : t('panel.theme_studio.light_badge')}
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Link href={`/settings/theme-studio/${customTheme.id}`}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-8"
                                            aria-label={`${t('panel.theme_studio.edit')}: ${customTheme.name}`}
                                        >
                                            <PencilIcon className="size-4" />
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-8"
                                        aria-label={`${t('panel.theme_studio.duplicate')}: ${customTheme.name}`}
                                        onClick={() => handleDuplicate(customTheme)}
                                    >
                                        <CopyIcon className="size-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-muted-foreground hover:text-destructive size-8"
                                        aria-label={`${t('panel.theme_studio.remove')}: ${customTheme.name}`}
                                        onClick={() => handleRemove(customTheme)}
                                    >
                                        <Trash2Icon className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="border-border/60 text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                            <PaletteIcon className="mx-auto mb-1.5 size-5 opacity-60" />
                            <p className="font-medium">{t('panel.theme_studio.empty_title')}</p>
                            <p className="text-xs">{t('panel.theme_studio.empty_desc')}</p>
                        </div>
                    )}
                    <Link href="/settings/theme-studio/new">
                        <Button variant="outline" size="sm" className="w-full">
                            <PlusIcon className="mr-1.5 size-4" />
                            {t('panel.theme_studio.new_theme')}
                        </Button>
                    </Link>
                </div>
            </SettingItem>
        </SettingsCardShell>
    );
}
