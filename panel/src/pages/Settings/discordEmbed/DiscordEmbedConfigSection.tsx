import { Input } from '@/components/ui/input';
import SwitchText from '@/components/SwitchText';
import { useLocale } from '@/hooks/locale';
import type { DiscordEmbedConfigDraft } from '@shared/discordEmbedDraft/types';
import type { EmbedEditorVariant } from '../embedEditorState';

type DiscordEmbedConfigSectionProps = {
    variant: EmbedEditorVariant;
    config: DiscordEmbedConfigDraft;
    onChange: (config: DiscordEmbedConfigDraft) => void;
};

export function DiscordEmbedConfigSection({ variant, config, onChange }: DiscordEmbedConfigSectionProps) {
    const { t } = useLocale();
    const patch = (patch: Partial<DiscordEmbedConfigDraft>) => onChange({ ...config, ...patch });

    return (
        <div className="border-border/60 space-y-3 rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">{t('panel.settings.embed_editor.section_config')}</p>
            <div className="grid gap-3 sm:grid-cols-3">
                {(['onlineColor', 'partialColor', 'offlineColor'] as const).map((key) => (
                    <div key={key}>
                        <label className="text-foreground mb-1 block text-xs font-medium" htmlFor={key}>
                            {t(`panel.settings.embed_editor.${key}`)}
                        </label>
                        <Input
                            id={key}
                            type="color"
                            className="h-9 w-full px-1"
                            value={config[key].startsWith('#') ? config[key] : '#000000'}
                            onChange={(e) => patch({ [key]: e.target.value })}
                        />
                        <Input
                            className="mt-1 h-8 font-mono text-xs"
                            value={config[key]}
                            onChange={(e) => patch({ [key]: e.target.value })}
                        />
                    </div>
                ))}
            </div>

            {variant === 'status' && (
                <div className="grid gap-3 sm:grid-cols-3">
                    {(['onlineString', 'partialString', 'offlineString'] as const).map((key) => (
                        <div key={key}>
                            <label className="text-foreground mb-1 block text-xs font-medium">
                                {t(`panel.settings.embed_editor.${key}`)}
                            </label>
                            <Input
                                value={config[key] ?? ''}
                                onChange={(e) => patch({ [key]: e.target.value || undefined })}
                            />
                        </div>
                    ))}
                </div>
            )}

            {variant === 'playerList' && (
                <>
                    <p className="text-muted-foreground text-xs font-medium">
                        {t('panel.settings.embed_editor.section_player_list')}
                    </p>
                    <div className="space-y-2">
                        {(
                            [
                                'playerLineTemplate',
                                'playerInlineTemplate',
                                'playerColumnTemplate',
                                'playerListSeparator',
                                'playerListInlineSeparator',
                                'emptyPlayerListString',
                            ] as const
                        ).map((key) => (
                            <div key={key}>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    {t(`panel.settings.embed_editor.${key}`)}
                                </label>
                                <Input
                                    value={config[key] ?? ''}
                                    onChange={(e) => patch({ [key]: e.target.value || undefined })}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {(['playerColumnCount', 'playersPerColumn', 'maxPlayersShown'] as const).map((key) => (
                            <div key={key}>
                                <label className="text-foreground mb-1 block text-xs font-medium">
                                    {t(`panel.settings.embed_editor.${key}`)}
                                </label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={config[key] ?? ''}
                                    onChange={(e) => {
                                        const parsed = Number.parseInt(e.target.value, 10);
                                        patch({ [key]: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined });
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                    <SwitchText
                        checkedLabel={t('panel.settings.embed_editor.show_pager_on')}
                        uncheckedLabel={t('panel.settings.embed_editor.show_pager_off')}
                        checked={config.showPagerButtons !== false}
                        onCheckedChange={(showPagerButtons) => patch({ showPagerButtons })}
                    />
                </>
            )}
        </div>
    );
}
