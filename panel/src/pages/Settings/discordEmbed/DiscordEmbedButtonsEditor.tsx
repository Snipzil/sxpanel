import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/locale';
import {
    createDraftId,
    type DiscordEmbedConfigDraft,
    type DiscordLinkButtonDraft,
} from '@shared/discordEmbedDraft/types';
import { Plus, Trash2 } from 'lucide-react';

type DiscordEmbedButtonsEditorProps = {
    config: DiscordEmbedConfigDraft;
    onChange: (config: DiscordEmbedConfigDraft) => void;
};

export function DiscordEmbedButtonsEditor({ config, onChange }: DiscordEmbedButtonsEditorProps) {
    const { t } = useLocale();

    const patchButtons = (buttons: DiscordLinkButtonDraft[]) => onChange({ ...config, buttons });

    const handlePatch = (id: string, patch: Partial<DiscordLinkButtonDraft>) => {
        patchButtons(config.buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    };

    return (
        <div className="border-border/60 space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-foreground text-sm font-medium">
                    {t('panel.settings.embed_editor.section_buttons')}
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        patchButtons([
                            ...config.buttons,
                            {
                                id: createDraftId(),
                                label: '{{connectButtonLabel}}',
                                url: '{{serverJoinUrl}}',
                            },
                        ])
                    }
                >
                    <Plus className="mr-1 size-4" />
                    {t('panel.settings.embed_editor.add_button')}
                </Button>
            </div>

            <div className="space-y-2">
                {config.buttons.map((button) => (
                    <div key={button.id} className="bg-muted/20 space-y-2 rounded-md border p-2">
                        <div className="flex gap-2">
                            <Input
                                className="h-8 flex-1"
                                value={button.label}
                                onChange={(e) => handlePatch(button.id, { label: e.target.value })}
                                placeholder={t('panel.settings.embed_editor.button_label')}
                            />
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8 shrink-0"
                                onClick={() => patchButtons(config.buttons.filter((b) => b.id !== button.id))}
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        </div>
                        <Input
                            className="h-8"
                            value={button.url}
                            onChange={(e) => handlePatch(button.id, { url: e.target.value })}
                            placeholder={t('panel.settings.embed_editor.button_url')}
                        />
                        <Input
                            className="h-8"
                            value={button.emoji ?? ''}
                            onChange={(e) => handlePatch(button.id, { emoji: e.target.value || undefined })}
                            placeholder={t('panel.settings.embed_editor.button_emoji')}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
