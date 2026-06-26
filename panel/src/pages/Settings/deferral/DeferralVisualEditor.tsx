import { useMemo } from 'react';
import { useLocale } from '@/hooks/locale';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndSortableGroup, DndSortableItem } from '@/components/dndSortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AutosizeTextarea } from '@/components/ui/autosize-textarea';
import SwitchText from '@/components/SwitchText';
import {
    createDefaultBlock,
    layoutFromLegacyTemplate,
    syncLegacyFieldsFromLayout,
    type DeferralBlockType,
    type DeferralCardLayout,
    type DeferralLayoutBlock,
} from '@shared/deferralCardLayout';
import type { DeferralCardTemplate } from '@shared/deferralCardTypes';
import { Plus } from 'lucide-react';
import { deferralBlockDescription, deferralBlockLabel, deferralBlockDefaultContent } from './deferralStudioLocale';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type DeferralVisualEditorProps = {
    template: DeferralCardTemplate;
    onChange: (template: DeferralCardTemplate) => void;
};

const ADDABLE_BLOCKS: DeferralBlockType[] = [
    'heading',
    'text',
    'custom_text',
    'paragraph',
    'rejection_message',
    'request_id',
    'ban_id',
    'ban_reason',
    'ban_expires',
    'tier_name',
    'custom_image',
    'button',
    'spacer',
    'divider',
    'logo',
];

function ensureLayout(template: DeferralCardTemplate): DeferralCardLayout {
    return template.layout?.blocks?.length ? template.layout : layoutFromLegacyTemplate(template);
}

export function DeferralVisualEditor({ template, onChange }: DeferralVisualEditorProps) {
    const { t } = useLocale();
    const layout = useMemo(() => ensureLayout(template), [template]);
    const blockIds = layout.blocks.map((b) => b.id);

    const patchLayout = (blocks: DeferralLayoutBlock[]) => {
        const next = syncLegacyFieldsFromLayout({ ...template, layout: { version: 1, blocks } });
        onChange(next);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = layout.blocks.findIndex((b) => b.id === active.id);
        const newIndex = layout.blocks.findIndex((b) => b.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        patchLayout(arrayMove(layout.blocks, oldIndex, newIndex));
    };

    const handlePatchBlock = (id: string, patch: Partial<DeferralLayoutBlock>) => {
        patchLayout(layout.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    };

    const handleRemoveBlock = (id: string) => {
        patchLayout(layout.blocks.filter((b) => b.id !== id));
    };

    const handleAddBlock = (type: DeferralBlockType) => {
        patchLayout([...layout.blocks, createDefaultBlock(type)]);
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-foreground text-sm font-medium">
                    {t('panel.deferral_studio.visual_editor.layout_title')}
                </p>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="outline">
                            <Plus className="mr-1 size-4" />
                            {t('panel.deferral_studio.visual_editor.add_block')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {ADDABLE_BLOCKS.map((type) => (
                            <DropdownMenuItem key={type} onClick={() => handleAddBlock(type)}>
                                {deferralBlockLabel(t, type)}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <DndSortableGroup ids={blockIds} onDragEnd={handleDragEnd} className="flex flex-col gap-2">
                {layout.blocks.map((block) => (
                    <DndSortableItem key={block.id} id={block.id} className="flex-col items-stretch">
                        <DeferralBlockEditor
                            block={block}
                            onPatch={(patch) => handlePatchBlock(block.id, patch)}
                            onRemove={() => handleRemoveBlock(block.id)}
                            t={t}
                        />
                    </DndSortableItem>
                ))}
            </DndSortableGroup>
        </div>
    );
}

type DeferralBlockEditorProps = {
    block: DeferralLayoutBlock;
    onPatch: (patch: Partial<DeferralLayoutBlock>) => void;
    onRemove: () => void;
    t: ReturnType<typeof useLocale>['t'];
};

function DeferralBlockEditor({ block, onPatch, onRemove, t }: DeferralBlockEditorProps) {
    const defaultContent = deferralBlockDefaultContent(t, block.type);

    return (
        <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-foreground text-sm font-medium">{deferralBlockLabel(t, block.type)}</p>
                <div className="flex items-center gap-2">
                    <SwitchText
                        checkedLabel={t('panel.deferral_studio.visual_editor.switch_on')}
                        uncheckedLabel={t('panel.deferral_studio.visual_editor.switch_off')}
                        checked={block.enabled !== false}
                        onCheckedChange={(checked) => onPatch({ enabled: checked })}
                    />
                    <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
                        {t('panel.deferral_studio.visual_editor.remove_block')}
                    </Button>
                </div>
            </div>
            <p className="text-muted-foreground text-xs">{deferralBlockDescription(t, block.type)}</p>
            {block.type === 'heading' ? (
                <Input
                    value={block.content ?? ''}
                    placeholder={defaultContent || t('panel.deferral_studio.visual_editor.title_placeholder')}
                    onChange={(e) => onPatch({ content: e.target.value })}
                />
            ) : block.type === 'paragraph' ||
              block.type === 'rejection_message' ||
              block.type === 'text' ||
              block.type === 'custom_text' ? (
                <AutosizeTextarea
                    value={block.content ?? ''}
                    placeholder={
                        block.type === 'custom_text'
                            ? t('panel.deferral_studio.visual_editor.custom_text_placeholder')
                            : defaultContent
                    }
                    onChange={(e) => onPatch({ content: e.target.value })}
                    minHeight={block.type === 'custom_text' ? 100 : 72}
                    maxHeight={220}
                />
            ) : null}
        </div>
    );
}
