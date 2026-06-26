import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndSortableGroup, DndSortableItem } from '@/components/dndSortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AutosizeTextarea } from '@/components/ui/autosize-textarea';
import SwitchText from '@/components/SwitchText';
import { useLocale } from '@/hooks/locale';
import { createDraftId, type DiscordEmbedDraft, type DiscordEmbedFieldDraft } from '@shared/discordEmbedDraft/types';
import { Plus, Trash2 } from 'lucide-react';

type DiscordEmbedFieldsEditorProps = {
    embed: DiscordEmbedDraft;
    onChange: (embed: DiscordEmbedDraft) => void;
};

export function DiscordEmbedFieldsEditor({ embed, onChange }: DiscordEmbedFieldsEditorProps) {
    const { t } = useLocale();

    const patchFields = (fields: DiscordEmbedFieldDraft[]) => onChange({ ...embed, fields });

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = embed.fields.findIndex((f) => f.id === active.id);
        const newIndex = embed.fields.findIndex((f) => f.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        patchFields(arrayMove(embed.fields, oldIndex, newIndex));
    };

    const handlePatchField = (id: string, patch: Partial<DiscordEmbedFieldDraft>) => {
        patchFields(embed.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    };

    return (
        <div className="border-border/60 space-y-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-foreground text-sm font-medium">{t('panel.settings.embed_editor.section_fields')}</p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                        patchFields([
                            ...embed.fields,
                            { id: createDraftId(), name: 'Field', value: '{{statusString}}', inline: true },
                        ])
                    }
                >
                    <Plus className="mr-1 size-4" />
                    {t('panel.settings.embed_editor.add_field')}
                </Button>
            </div>

            <DndSortableGroup
                ids={embed.fields.map((f) => f.id)}
                onDragEnd={handleDragEnd}
                className="flex flex-col gap-2"
            >
                {embed.fields.map((field) => (
                    <DndSortableItem key={field.id} id={field.id} className="flex-col items-stretch">
                        <div className="bg-muted/20 space-y-2 rounded-md border p-2">
                            <div className="flex items-center gap-2">
                                <Input
                                    className="h-8 flex-1"
                                    value={field.name}
                                    onChange={(e) => handlePatchField(field.id, { name: e.target.value })}
                                    placeholder={t('panel.settings.embed_editor.field_name')}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="size-8 shrink-0"
                                    onClick={() => patchFields(embed.fields.filter((f) => f.id !== field.id))}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                            <AutosizeTextarea
                                value={field.value}
                                onChange={(e) => handlePatchField(field.id, { value: e.target.value })}
                                minHeight={48}
                                maxHeight={160}
                            />
                            <SwitchText
                                checkedLabel={t('panel.settings.embed_editor.field_inline_on')}
                                uncheckedLabel={t('panel.settings.embed_editor.field_inline_off')}
                                checked={field.inline === true}
                                onCheckedChange={(inline) => handlePatchField(field.id, { inline })}
                            />
                        </div>
                    </DndSortableItem>
                ))}
            </DndSortableGroup>
        </div>
    );
}
