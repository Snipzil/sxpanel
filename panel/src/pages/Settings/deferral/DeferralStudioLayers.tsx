import type { DeferralCanvasElement } from '@shared/deferralCardCanvas';
import type { DeferralBlockType } from '@shared/deferralCardLayout';
import { useLocale } from '@/hooks/locale';
import { deferralBlockLabel } from './deferralStudioLocale';
import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndSortableGroup, DndSortableItem } from '@/components/dndSortable';

type DeferralStudioLayersProps = {
    elements: DeferralCanvasElement[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onToggleVisible: (id: string) => void;
    onReorder: (elements: DeferralCanvasElement[]) => void;
};

function layerLabel(el: DeferralCanvasElement, t: ReturnType<typeof useLocale>['t']): string {
    const type = el.type as DeferralBlockType;
    return deferralBlockLabel(t, type);
}

/** Top of the list = front (drawn last). Bottom = back. */
function stackOrderToDisplayIds(elements: DeferralCanvasElement[]): string[] {
    return [...elements].reverse().map((el) => el.id);
}

function displayOrderToStack(elements: DeferralCanvasElement[], displayIds: string[]): DeferralCanvasElement[] {
    const byId = new Map(elements.map((el) => [el.id, el]));
    return [...displayIds]
        .reverse()
        .map((id) => byId.get(id))
        .filter((el): el is DeferralCanvasElement => !!el);
}

export function DeferralStudioLayers({
    elements,
    selectedId,
    onSelect,
    onToggleVisible,
    onReorder,
}: DeferralStudioLayersProps) {
    const { t } = useLocale();
    const displayIds = stackOrderToDisplayIds(elements);

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const oldIndex = displayIds.indexOf(String(active.id));
        const newIndex = displayIds.indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        onReorder(displayOrderToStack(elements, arrayMove(displayIds, oldIndex, newIndex)));
    };

    if (!elements.length) {
        return <p className="text-muted-foreground text-xs">{t('panel.deferral_studio.layers.empty')}</p>;
    }

    return (
        <DndSortableGroup ids={displayIds} onDragEnd={handleDragEnd} className="flex flex-col gap-0.5">
            {displayIds.map((id) => {
                const el = elements.find((e) => e.id === id);
                if (!el) return null;
                const hidden = el.enabled === false;
                return (
                    <DndSortableItem
                        key={el.id}
                        id={el.id}
                        className="border-0 bg-transparent px-0 py-0 shadow-none aria-pressed:shadow-none"
                    >
                        <div
                            className={cn(
                                'flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-1 text-xs transition-colors',
                                selectedId === el.id
                                    ? 'bg-primary/10 text-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                hidden && 'opacity-50',
                            )}
                        >
                            <button
                                type="button"
                                className="min-w-0 flex-1 truncate text-left"
                                onClick={() => onSelect(el.id)}
                            >
                                {layerLabel(el, t)}
                            </button>
                            <button
                                type="button"
                                className="text-muted-foreground hover:text-foreground shrink-0"
                                aria-label={
                                    hidden
                                        ? t('panel.deferral_studio.layers.show_element')
                                        : t('panel.deferral_studio.layers.hide_element')
                                }
                                onClick={() => onToggleVisible(el.id)}
                            >
                                {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                            </button>
                        </div>
                    </DndSortableItem>
                );
            })}
        </DndSortableGroup>
    );
}
