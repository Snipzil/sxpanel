import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRoute } from 'wouter';
import { navigate } from 'wouter/use-browser-location';
import { customAlphabet } from 'nanoid';
import { alphanumeric } from 'nanoid-dictionary';
import { PaletteIcon, Trash2Icon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocale } from '@/hooks/locale';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { BackendApiError, useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import type { CustomThemeDataType, GetCustomThemesSuccessResp, SaveCustomThemesReq } from '@shared/otherTypes';
import {
    DEFAULT_DARK_THEME_TOKENS,
    DEFAULT_LIGHT_THEME_TOKENS,
    THEME_COLOR_TOKEN_GROUPS,
    HSL_TRIPLE_REGEX,
    type ThemeColorTokenStyle,
} from '@shared/themeTokens';
import ThemeStudioColorField from './theme/ThemeStudioColorField';
import ThemeStudioPreview from './theme/ThemeStudioPreview';

const genThemeId = customAlphabet(alphanumeric, 21);

const isValidStyle = (style: ThemeColorTokenStyle) => Object.values(style).every((v) => HSL_TRIPLE_REGEX.test(v));

export default function ThemeStudioPage() {
    const { t } = useLocale();
    const openConfirmDialog = useOpenConfirmDialog();
    const [, params] = useRoute('/settings/theme-studio/:themeId');
    const themeId = params?.themeId ?? 'new';
    const isNew = themeId === 'new';
    const generatedIdRef = useRef(genThemeId());
    const [isSaving, setIsSaving] = useState(false);

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

    const existing = useMemo(() => swr.data?.find((theme) => theme.id === themeId), [swr.data, themeId]);

    const [name, setName] = useState(() => existing?.name ?? '');
    const [isDark, setIsDark] = useState(() => existing?.isDark ?? true);
    const [style, setStyle] = useState<ThemeColorTokenStyle>(() => existing?.style ?? DEFAULT_DARK_THEME_TOKENS);
    const [hydrated, setHydrated] = useState(!!existing);

    //Hydrate local draft once the theme list arrives (editing an existing theme)
    useEffect(() => {
        if (hydrated || !existing) return;
        setName(existing.name);
        setIsDark(existing.isDark);
        setStyle(existing.style);
        setHydrated(true);
    }, [hydrated, existing]);

    //Editing a theme that doesn't exist (bad link, or deleted elsewhere) - bounce back
    useEffect(() => {
        if (!isNew && swr.data && !existing) {
            navigate('/settings#appearance');
        }
    }, [isNew, swr.data, existing]);

    if (!isNew && swr.data && !existing) return null;

    const patchColor = (key: keyof ThemeColorTokenStyle, value: string) => {
        setStyle((prev) => ({ ...prev, [key]: value }));
    };

    const applyPreset = (preset: 'dark' | 'light') => {
        setIsDark(preset === 'dark');
        setStyle(preset === 'dark' ? DEFAULT_DARK_THEME_TOKENS : DEFAULT_LIGHT_THEME_TOKENS);
    };

    const handleSave = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            txToast.error({
                title: t('panel.theme_studio.save_failed_title'),
                msg: t('panel.theme_studio.name_required'),
            });
            return;
        }
        if (!isValidStyle(style)) {
            txToast.error({
                title: t('panel.theme_studio.save_failed_title'),
                msg: t('panel.theme_studio.invalid_colors'),
            });
            return;
        }

        const draft: CustomThemeDataType = {
            id: existing?.id ?? generatedIdRef.current,
            name: trimmedName,
            isDark,
            style,
        };
        const nextList = existing
            ? (swr.data ?? []).map((theme) => (theme.id === draft.id ? draft : theme))
            : [...(swr.data ?? []), draft];

        setIsSaving(true);
        try {
            const resp = await saveApi({ data: nextList });
            if (!resp || resp.error) {
                txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: resp?.error ?? '' });
                return;
            }
            await swr.mutate(nextList, false);
            txToast.success({
                title: t('panel.theme_studio.saved_title'),
                msg: t('panel.theme_studio.saved_msg', { name: trimmedName }),
            });
            openConfirmDialog({
                title: t('panel.theme_studio.reload_prompt_title'),
                message: t('panel.theme_studio.reload_prompt_msg'),
                actionLabel: t('panel.theme_studio.reload_now'),
                cancelLabel: t('panel.theme_studio.reload_later'),
                onConfirm: () => window.location.reload(),
                onCancel: () => navigate('/settings#appearance'),
            });
        } catch (error) {
            const msg = error instanceof BackendApiError || error instanceof Error ? error.message : String(error);
            txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg });
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (!existing) return;
        openConfirmDialog({
            title: t('panel.theme_studio.remove_confirm_title'),
            message: t('panel.theme_studio.remove_confirm_message'),
            actionLabel: t('panel.theme_studio.remove'),
            confirmBtnVariant: 'destructive',
            onConfirm: async () => {
                const nextList = (swr.data ?? []).filter((theme) => theme.id !== existing.id);
                setIsSaving(true);
                try {
                    const resp = await saveApi({ data: nextList });
                    if (!resp || resp.error) {
                        txToast.error({ title: t('panel.theme_studio.save_failed_title'), msg: resp?.error ?? '' });
                        return;
                    }
                    await swr.mutate(nextList, false);
                    txToast.success({ title: t('panel.theme_studio.removed_title'), msg: existing.name });
                    navigate('/settings#appearance');
                } finally {
                    setIsSaving(false);
                }
            },
        });
    };

    return (
        <div className="mx-auto mb-10 flex w-full max-w-(--breakpoint-xl) min-w-96 flex-col px-2 md:px-0">
            <PageHeader
                icon={<PaletteIcon />}
                title={isNew ? t('panel.theme_studio.editor_title_new') : t('panel.theme_studio.editor_title_edit')}
                parentName={t('panel.routes.settings')}
                parentLink="/settings#appearance"
            />

            {/*
                NOTE: these buttons must NOT be passed as PageHeader children - PageHeader
                hoists its content through an atom keyed only on title/description/parentName/
                parentLink (see page-header.tsx), so closures over local state (name, style,
                isSaving, ...) would go stale after the first publish and never update again.
            */}
            <div className="mb-4 flex justify-end gap-2">
                {!isNew ? (
                    <Button
                        variant="ghost"
                        className="text-destructive-inline"
                        onClick={handleDelete}
                        disabled={isSaving}
                    >
                        <Trash2Icon className="mr-1.5 size-4" />
                        {t('panel.theme_studio.remove')}
                    </Button>
                ) : null}
                <Button onClick={handleSave} disabled={isSaving}>
                    {t('panel.theme_studio.save')}
                </Button>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    <div className="border-border/60 bg-background space-y-3 rounded-xl border p-4">
                        <div>
                            <Label htmlFor="theme-name">{t('panel.theme_studio.name_label')}</Label>
                            <Input
                                id="theme-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('panel.theme_studio.name_placeholder')}
                                className="mt-1"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="theme-is-dark">{t('panel.theme_studio.dark_badge')}</Label>
                            <Switch id="theme-is-dark" checked={isDark} onCheckedChange={setIsDark} />
                        </div>
                        <div>
                            <p className="text-muted-foreground mb-2 text-xs">{t('panel.theme_studio.base_desc')}</p>
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('dark')}>
                                    {t('panel.theme_studio.base_dark')}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('light')}>
                                    {t('panel.theme_studio.base_light')}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <ScrollArea className="max-h-[60vh] min-h-0">
                        <div className="space-y-4 pr-3">
                            {THEME_COLOR_TOKEN_GROUPS.map((group) => (
                                <div key={group.id} className="border-border/60 bg-background rounded-xl border p-4">
                                    <p className="text-foreground mb-3 text-sm font-semibold">
                                        {t(`panel.theme_studio.group_${group.id}`)}
                                    </p>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {group.keys.map((key) => (
                                            <ThemeStudioColorField
                                                key={key}
                                                label={t(`panel.theme_studio.tokens.${key}`)}
                                                value={style[key]}
                                                onChange={(value) => patchColor(key, value)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                <div className="w-full shrink-0 lg:sticky lg:top-4 lg:w-96 lg:self-start">
                    <p className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                        {t('panel.theme_studio.preview_label')}
                    </p>
                    <ThemeStudioPreview style={style} />
                </div>
            </div>
        </div>
    );
}
