import type { DeferralCardTemplate } from '@shared/deferralCardTypes';
import type { DeferralCardTokens } from '@shared/deferralCardRender';
import type { DeferralCanvasElement } from '@shared/deferralCardCanvas';
import {
    DEFERRAL_CANVAS_SNAP_GRID,
    DEFERRAL_CARD_HEIGHT_MAX,
    DEFERRAL_CARD_HEIGHT_MIN,
    DEFERRAL_CARD_WIDTH_MAX,
    DEFERRAL_CARD_WIDTH_MIN,
} from '@shared/deferralCardCanvas';
import { useLocale } from '@/hooks/locale';
import { DeferralStudioCard } from './DeferralStudioCard';

type DeferralStudioCanvasProps = {
    cardWidth: number;
    cardHeight: number;
    elements: DeferralCanvasElement[];
    selectedId: string | null;
    showLogo: boolean;
    showGrid: boolean;
    snapToGrid: boolean;
    template: DeferralCardTemplate;
    tokens: DeferralCardTokens;
    isBlank: boolean;
    onSelect: (id: string | null) => void;
    onMoveElement: (id: string, x: number, y: number) => void;
};

export function DeferralStudioCanvas({
    cardWidth,
    cardHeight,
    elements,
    selectedId,
    showLogo,
    showGrid,
    snapToGrid,
    template,
    tokens,
    isBlank,
    onSelect,
    onMoveElement,
}: DeferralStudioCanvasProps) {
    const { t } = useLocale();

    return (
        <div className="bg-muted/20 relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.35]"
                style={{
                    backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
                    backgroundSize: '20px 20px',
                }}
            />

            <div className="relative flex flex-1 flex-col items-center justify-center overflow-auto p-6">
                <div className="mb-4 text-center">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {t('panel.deferral_studio.canvas.preview_title')}
                    </p>
                    <p className="text-muted-foreground/80 mt-1 text-xs">
                        {t('panel.deferral_studio.canvas.size_line', { width: cardWidth, height: cardHeight })}
                        {snapToGrid
                            ? ` · ${t('panel.deferral_studio.canvas.snap_grid', { grid: DEFERRAL_CANVAS_SNAP_GRID })}`
                            : ` · ${t('panel.deferral_studio.canvas.snap_free')}`}
                        {showGrid
                            ? ` · ${t('panel.deferral_studio.canvas.grid_visible', { grid: DEFERRAL_CANVAS_SNAP_GRID })}`
                            : ''}
                        {` · ${t('panel.deferral_studio.canvas.max_size', {
                            maxW: DEFERRAL_CARD_WIDTH_MAX,
                            maxH: DEFERRAL_CARD_HEIGHT_MAX,
                        })}`}
                    </p>
                </div>

                {isBlank ? (
                    <div
                        className="border-border text-muted-foreground bg-card/50 flex min-h-[220px] items-center justify-center rounded-lg border border-dashed px-8 text-center text-sm"
                        style={{ width: cardWidth, marginTop: 25 }}
                    >
                        {t('panel.deferral_studio.canvas.blank_hint')}
                    </div>
                ) : (
                    <DeferralStudioCard
                        cardWidth={cardWidth}
                        cardHeight={cardHeight}
                        elements={elements}
                        selectedId={selectedId}
                        showLogo={showLogo}
                        showGrid={showGrid}
                        snapToGrid={snapToGrid}
                        template={template}
                        tokens={tokens}
                        onSelect={onSelect}
                        onMoveElement={onMoveElement}
                    />
                )}
            </div>
        </div>
    );
}

export { DEFERRAL_CARD_WIDTH_MIN, DEFERRAL_CARD_WIDTH_MAX, DEFERRAL_CARD_HEIGHT_MIN, DEFERRAL_CARD_HEIGHT_MAX };
