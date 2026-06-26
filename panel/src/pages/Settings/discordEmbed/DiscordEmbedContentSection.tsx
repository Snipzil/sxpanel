import { Input } from '@/components/ui/input';
import { AutosizeTextarea } from '@/components/ui/autosize-textarea';
import { useLocale } from '@/hooks/locale';
import type { DiscordEmbedDraft } from '@shared/discordEmbedDraft/types';

type DiscordEmbedContentSectionProps = {
    embed: DiscordEmbedDraft;
    onChange: (embed: DiscordEmbedDraft) => void;
};

export function DiscordEmbedContentSection({ embed, onChange }: DiscordEmbedContentSectionProps) {
    const { t } = useLocale();

    const patch = (patch: Partial<DiscordEmbedDraft>) => onChange({ ...embed, ...patch });

    return (
        <div className="border-border/60 space-y-3 rounded-lg border p-3">
            <p className="text-foreground text-sm font-medium">{t('panel.settings.embed_editor.section_content')}</p>
            <div>
                <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-title">
                    {t('panel.settings.embed_editor.field_title')}
                </label>
                <Input id="embed-title" value={embed.title ?? ''} onChange={(e) => patch({ title: e.target.value })} />
            </div>
            <div>
                <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-url">
                    {t('panel.settings.embed_editor.field_url')}
                </label>
                <Input id="embed-url" value={embed.url ?? ''} onChange={(e) => patch({ url: e.target.value })} />
            </div>
            <div>
                <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-desc">
                    {t('panel.settings.embed_editor.field_description')}
                </label>
                <AutosizeTextarea
                    id="embed-desc"
                    value={embed.description ?? ''}
                    onChange={(e) => patch({ description: e.target.value })}
                    minHeight={80}
                    maxHeight={200}
                />
            </div>
            <div>
                <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-color">
                    {t('panel.settings.embed_editor.field_color')}
                </label>
                <Input
                    id="embed-color"
                    value={embed.color ?? ''}
                    onChange={(e) => patch({ color: e.target.value })}
                    placeholder="{{statusColor}}"
                />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-thumb">
                        {t('panel.settings.embed_editor.field_thumbnail')}
                    </label>
                    <Input
                        id="embed-thumb"
                        value={embed.thumbnailUrl ?? ''}
                        onChange={(e) => patch({ thumbnailUrl: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-image">
                        {t('panel.settings.embed_editor.field_image')}
                    </label>
                    <Input
                        id="embed-image"
                        value={embed.imageUrl ?? ''}
                        onChange={(e) => patch({ imageUrl: e.target.value })}
                    />
                </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-footer-text">
                        {t('panel.settings.embed_editor.field_footer_text')}
                    </label>
                    <Input
                        id="embed-footer-text"
                        value={embed.footerText ?? ''}
                        onChange={(e) => patch({ footerText: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-foreground mb-1 block text-xs font-medium" htmlFor="embed-footer-icon">
                        {t('panel.settings.embed_editor.field_footer_icon')}
                    </label>
                    <Input
                        id="embed-footer-icon"
                        value={embed.footerIconUrl ?? ''}
                        onChange={(e) => patch({ footerIconUrl: e.target.value })}
                    />
                </div>
            </div>
        </div>
    );
}
