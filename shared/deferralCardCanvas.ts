import type { DeferralCardTemplate, DeferralScenarioId } from './deferralCardTypes';
import { DEFAULT_DEFERRAL_CARD_TEMPLATES, DeferralScenarioIdSchema } from './deferralCardTypes';
import { isAddonDeferralScenarioId } from './deferralAddonTypes';
import {
    DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX,
    DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX,
    DEFERRAL_WATERMARK_INSET_PX,
    DEFERRAL_WATERMARK_MAX_HEIGHT_PX,
    DEFERRAL_WATERMARK_MAX_WIDTH_PX,
} from './deferralCardWatermark';
import type { DeferralBlockType, DeferralLayoutBlock } from './deferralCardLayoutCore';
import { DeferralBlockTypeSchema, DEFERRAL_BLOCK_META, normalizeCustomPlaceholders } from './deferralCardLayoutCore';
import { createDeferralBlockId } from './deferralCardIds';
import {
    finalizeDeferralButtonContent,
    parseDeferralButtonContent,
    serializeDeferralButtonContent,
} from './deferralCardButton';
import { normalizeDeferralImageContent } from './deferralCardSvg';
import { BAN_STUDIO_PREVIEW_SNIPPETS } from './deferralCardBan';
import { getDefaultDeferralCardLayout } from './deferralCardDefaultLayouts';
import {
    estimateCanvasElementHeight,
    estimateCanvasElementSize,
    estimateWrappedTextHeight,
    estimateWrappedTextLineCount,
    getCanvasContentWidth,
    snapDeferralCoord,
    splitHtmlLines,
    stripHtmlForMeasure,
} from './deferralCardCanvasMeasure';
import { reflowStackedCanvasElements, resolveDeferralLogoPlacement } from './deferralCardCanvasReflow';
import {
    DEFERRAL_CANVAS_SNAP_GRID,
    DEFERRAL_CARD_CANVAS_HEIGHT,
    DEFERRAL_CARD_CANVAS_WIDTH,
    DEFERRAL_CARD_CONTAINER_STYLE,
    DEFERRAL_CARD_HEIGHT_MAX,
    DEFERRAL_CARD_HEIGHT_MIN,
    DEFERRAL_CARD_MARGIN_TOP,
    DEFERRAL_CARD_PADDING,
    DEFERRAL_CARD_SIZE_PRESETS,
    DEFERRAL_CARD_WIDTH_MAX,
    DEFERRAL_CARD_WIDTH_MIN,
    DeferralCanvasElementSchema,
    DeferralCardCanvasSchema,
    type DeferralCanvasElement,
    type DeferralCardCanvas,
    type DeferralCardSizePresetId,
} from './deferralCardCanvasSchema';

export {
    DEFERRAL_CANVAS_SNAP_GRID,
    DEFERRAL_CARD_CANVAS_HEIGHT,
    DEFERRAL_CARD_CANVAS_WIDTH,
    DEFERRAL_CARD_CONTAINER_STYLE,
    DEFERRAL_CARD_HEIGHT_MAX,
    DEFERRAL_CARD_HEIGHT_MIN,
    DEFERRAL_CARD_MARGIN_TOP,
    DEFERRAL_CARD_PADDING,
    DEFERRAL_CARD_SIZE_PRESETS,
    DEFERRAL_CARD_WIDTH_MAX,
    DEFERRAL_CARD_WIDTH_MIN,
    DeferralCanvasElementSchema,
    DeferralCardCanvasSchema,
    type DeferralCanvasElement,
    type DeferralCardCanvas,
    type DeferralCardSizePresetId,
} from './deferralCardCanvasSchema';

export {
    estimateCanvasElementHeight,
    estimateCanvasElementSize,
    estimateWrappedTextHeight,
    estimateWrappedTextLineCount,
    getCanvasContentWidth,
    snapDeferralCoord,
    splitHtmlLines,
    stripHtmlForMeasure,
} from './deferralCardCanvasMeasure';
export { reflowStackedCanvasElements, resolveDeferralLogoPlacement } from './deferralCardCanvasReflow';

const CANVAS_ELEMENT_TYPES = new Set<DeferralCanvasElement['type']>([
    'heading',
    'text',
    'paragraph',
    'rejection_message',
    'request_id',
    'tier_name',
    'spacer',
    'divider',
    'logo',
    'custom_text',
    'custom_image',
    'button',
    'ban_id',
    'ban_reason',
    'ban_expires',
]);

/** Drops invalid entries from stored/API canvas arrays (null slots, bad types, non-string content). */
export function coerceCanvasElement(raw: unknown): DeferralCanvasElement | null {
    if (!raw || typeof raw !== 'object') return null;
    const el = raw as Record<string, unknown>;
    const type = el.type;
    if (typeof type !== 'string' || !CANVAS_ELEMENT_TYPES.has(type as DeferralCanvasElement['type'])) {
        return null;
    }
    const id = typeof el.id === 'string' && el.id.trim() ? el.id.trim() : createDeferralBlockId();
    let content =
        el.content === undefined || el.content === null
            ? undefined
            : typeof el.content === 'string'
              ? el.content
              : String(el.content);
    if (type === 'custom_image' && content) {
        content = normalizeDeferralImageContent(content) || undefined;
    }
    return {
        id,
        type: type as DeferralCanvasElement['type'],
        x: typeof el.x === 'number' && Number.isFinite(el.x) ? el.x : 0,
        y: typeof el.y === 'number' && Number.isFinite(el.y) ? el.y : 0,
        width: typeof el.width === 'number' && Number.isFinite(el.width) ? el.width : undefined,
        height: typeof el.height === 'number' && Number.isFinite(el.height) ? el.height : undefined,
        content,
        enabled: el.enabled !== false,
        style:
            typeof el.style === 'object' && el.style !== null
                ? (el.style as DeferralCanvasElement['style'])
                : undefined,
    };
}

export function coerceCanvasElements(input: unknown): DeferralCanvasElement[] {
    if (!Array.isArray(input)) return [];
    return input.map(coerceCanvasElement).filter((e): e is DeferralCanvasElement => e !== null);
}

export function clampCardWidth(width: number): number {
    return Math.max(DEFERRAL_CARD_WIDTH_MIN, Math.min(DEFERRAL_CARD_WIDTH_MAX, Math.round(width)));
}

export function clampCardHeight(height: number): number {
    return Math.max(DEFERRAL_CARD_HEIGHT_MIN, Math.min(DEFERRAL_CARD_HEIGHT_MAX, Math.round(height)));
}

export function clampCardSize(width: number, height: number): { width: number; height: number } {
    return { width: clampCardWidth(width), height: clampCardHeight(height) };
}

/** Magnetic snap when an element center is near the canvas center axis (Photoshop-style smart guides). */
export const DEFERRAL_CENTER_SNAP_PX = 8;

export function applyCanvasCenterSnap(
    x: number,
    y: number,
    width: number,
    height: number,
    canvasWidth: number,
    canvasHeight: number,
    threshold = DEFERRAL_CENTER_SNAP_PX,
): { x: number; y: number; showVerticalGuide: boolean; showHorizontalGuide: boolean } {
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    const elementCenterX = x + width / 2;
    const elementCenterY = y + height / 2;

    const showVerticalGuide = Math.abs(elementCenterX - canvasCenterX) <= threshold;
    const showHorizontalGuide = Math.abs(elementCenterY - canvasCenterY) <= threshold;

    return {
        x: showVerticalGuide ? Math.round(canvasCenterX - width / 2) : x,
        y: showHorizontalGuide ? Math.round(canvasCenterY - height / 2) : y,
        showVerticalGuide,
        showHorizontalGuide,
    };
}

/** Ensures every canvas element id is unique (repairs legacy default layouts with duplicate fact-grid ids). */
export function ensureUniqueCanvasElementIds(elements: DeferralCanvasElement[]): DeferralCanvasElement[] {
    const seen = new Set<string>();
    return elements.map((el) => {
        let id = el.id;
        if (!seen.has(id)) {
            seen.add(id);
            return el;
        }
        let suffix = 2;
        while (seen.has(`${id}_${suffix}`)) suffix += 1;
        id = `${id}_${suffix}`;
        seen.add(id);
        return { ...el, id };
    });
}

/** Snap coords and clamp inside card; does not re-stack elements. */
export function normalizeCanvasElements(
    elements: DeferralCanvasElement[],
    cardWidth = DEFERRAL_CARD_CANVAS_WIDTH,
    cardHeight = DEFERRAL_CARD_CANVAS_HEIGHT,
): DeferralCanvasElement[] {
    const contentWidth = getCanvasContentWidth(cardWidth);
    const contentHeight = cardHeight - DEFERRAL_CARD_PADDING * 2;

    return ensureUniqueCanvasElementIds(
        coerceCanvasElements(elements).map((el) => {
            if (el.type === 'logo') {
                const placed = resolveDeferralLogoPlacement(el, contentWidth, contentHeight);
                return {
                    ...el,
                    x: snapDeferralCoord(placed.x),
                    y: snapDeferralCoord(placed.y),
                    width: placed.width,
                    height: placed.height,
                };
            }
            const size = estimateCanvasElementSize(el, contentWidth);
            let width = el.width ?? size.width;
            let height = el.height ?? size.height;
            if (
                el.type === 'request_id' ||
                el.type === 'ban_id' ||
                el.type === 'ban_expires' ||
                el.type === 'tier_name' ||
                el.type === 'ban_reason'
            ) {
                const fresh = estimateCanvasElementSize({ ...el, width: undefined, height: undefined }, contentWidth);
                if (width < fresh.width) width = fresh.width;
                if (height < fresh.height) height = fresh.height;
            }
            const maxX = Math.max(0, contentWidth - width);
            const maxY = Math.max(0, contentHeight - height);
            return {
                ...el,
                x: snapDeferralCoord(Math.min(maxX, Math.max(0, el.x))),
                y: snapDeferralCoord(Math.min(maxY, Math.max(0, el.y))),
                width,
                height,
            };
        }),
    );
}

/** Split paragraph/html blocks into separate `text` lines. */
export function splitMultilineElements(elements: DeferralCanvasElement[]): DeferralCanvasElement[] {
    const out: DeferralCanvasElement[] = [];
    for (const rawEl of elements) {
        const el = coerceCanvasElement(rawEl);
        if (!el) continue;
        const raw = typeof el.content === 'string' ? el.content : '';
        const isMultiline =
            (el.type === 'paragraph' || el.type === 'text' || el.type === 'custom_text') &&
            (raw.includes('<br>') || raw.includes('<br/>') || raw.includes('<br />'));
        if (!isMultiline) {
            out.push(el);
            continue;
        }
        const parts = splitHtmlLines(raw);
        let y = el.y;
        const size0 = estimateCanvasElementSize({ ...el, type: 'text', content: parts[0] ?? '' }, 480);
        for (const part of parts) {
            const line: DeferralCanvasElement = {
                ...el,
                id: createDeferralBlockId(),
                type: 'text',
                content: part,
                y,
                width: undefined,
                height: undefined,
            };
            const size = estimateCanvasElementSize(line, 480);
            out.push({ ...line, width: size.width, height: size.height });
            y += size.height + 8;
        }
        if (!parts.length) out.push({ ...el, type: 'text' });
    }
    return out;
}

export function splitCustomMessageParts(customMessage?: string | null): string[] {
    return splitHtmlLines(customMessage, 'br-or-nl');
}

/** Resolves a single text-line element for preview/studio (splits `{customMessage}` across lines). */
export function resolveTextLineContent(
    el: DeferralCanvasElement,
    tokens: { customMessage?: string },
    template: DeferralCardTemplate,
    textLineIndex: number,
    messageParts: string[],
    applyTokens: (text: string) => string,
): string {
    const raw = el.content?.trim() ?? '';
    if (raw.includes('{customMessage}')) {
        if (messageParts.length > 1 && messageParts[textLineIndex]) {
            return messageParts[textLineIndex]!;
        }
        if (messageParts.length === 1) {
            return messageParts[0]!;
        }
        return tokens.customMessage ?? '';
    }
    return applyTokens(raw);
}

export function buildStudioDefaultElements(
    template: DeferralCardTemplate,
    sampleBody: string | undefined | null,
    cardWidth: number,
    cardHeight: number,
    scenarioId?: DeferralScenarioId | string,
): DeferralCanvasElement[] {
    if (scenarioId && !isAddonDeferralScenarioId(scenarioId)) {
        const parsed = DeferralScenarioIdSchema.safeParse(scenarioId);
        if (parsed.success) {
            const defaultElements = getDefaultDeferralCardLayout(parsed.data).canvas?.elements;
            if (defaultElements?.length) {
                return normalizeCanvasElements(
                    reflowStackedCanvasElements(
                        splitMultilineElements(coerceCanvasElements(defaultElements)),
                        cardWidth,
                        cardHeight,
                    ),
                    cardWidth,
                    cardHeight,
                );
            }
        }
    }

    const isBanScenario = scenarioId === 'ban_temporary' || scenarioId === 'ban_permanent';
    const safeSampleBody = sampleBody == null ? '' : String(sampleBody);
    const contentWidth = getCanvasContentWidth(cardWidth);
    const elements: DeferralCanvasElement[] = [];
    let y = 0;

    const pushEl = (el: Omit<DeferralCanvasElement, 'id'>) => {
        const full: DeferralCanvasElement = { ...el, id: createDeferralBlockId() };
        const size = estimateCanvasElementSize(full, contentWidth);
        elements.push({
            ...full,
            width: size.width,
            height: size.height,
            x: snapDeferralCoord(el.x),
            y: snapDeferralCoord(el.y),
        });
        y = Math.max(y, el.y + size.height + 8);
    };

    pushEl({
        type: 'heading',
        content: template.title?.trim() || 'Access Denied',
        x: 0,
        y: 0,
        enabled: true,
        style: { fontSize: 22, fontWeight: 'bold' },
    });

    if (isBanScenario) {
        pushEl({
            type: 'text',
            content: BAN_STUDIO_PREVIEW_SNIPPETS.expiresLine,
            x: 0,
            y,
            enabled: true,
            style: { fontSize: 18 },
        });
        pushEl({
            type: 'text',
            content: BAN_STUDIO_PREVIEW_SNIPPETS.reasonLine,
            x: 0,
            y,
            enabled: true,
            style: { fontSize: 18 },
        });
        pushEl({
            type: 'rejection_message',
            x: 0,
            y,
            enabled: true,
            style: { fontSize: 18 },
        });
    } else {
        const bodyTemplate = typeof template.bodyTemplate === 'string' ? template.bodyTemplate.trim() : '';
        if (bodyTemplate && bodyTemplate !== '{customMessage}') {
            const lines = splitHtmlLines(bodyTemplate);
            for (const line of lines.length ? lines : [bodyTemplate]) {
                pushEl({
                    type: 'text',
                    content: line,
                    x: 0,
                    y,
                    enabled: true,
                    style: { fontSize: 18 },
                });
            }
        } else if (safeSampleBody.trim()) {
            for (const line of splitCustomMessageParts(safeSampleBody)) {
                pushEl({
                    type: 'text',
                    content: line,
                    x: 0,
                    y,
                    enabled: true,
                    style: { fontSize: 18 },
                });
            }
        } else {
            pushEl({
                type: 'text',
                content: '{customMessage}',
                x: 0,
                y,
                enabled: true,
                style: { fontSize: 18 },
            });
        }
    }

    if (template.showRequestId && !isBanScenario) {
        pushEl({ type: 'request_id', x: 0, y, enabled: true, style: { fontSize: 18 } });
    }
    if (isBanScenario) {
        pushEl({ type: 'ban_id', x: 0, y, enabled: true, style: { fontSize: 18 } });
        pushEl({ type: 'ban_expires', x: 0, y: y + 28, enabled: true, style: { fontSize: 16 } });
        pushEl({ type: 'ban_reason', x: 0, y: y + 56, width: contentWidth, enabled: true, style: { fontSize: 16 } });
    }
    if (template.showTierName) {
        pushEl({ type: 'tier_name', x: 0, y, enabled: true, style: { fontSize: 18 } });
    }

    const logoPlaced = resolveDeferralLogoPlacement(
        { x: 0, y: 0, width: DEFERRAL_WATERMARK_MAX_WIDTH_PX, height: DEFERRAL_WATERMARK_MAX_HEIGHT_PX },
        contentWidth,
        cardHeight - DEFERRAL_CARD_PADDING * 2,
    );
    pushEl({
        type: 'logo',
        x: logoPlaced.x,
        y: logoPlaced.y,
        width: logoPlaced.width,
        height: logoPlaced.height,
        enabled: true,
    });

    return normalizeCanvasElements(elements, cardWidth, cardHeight);
}

export function resolveCanvasHeight(canvas: DeferralCardCanvas): number {
    if (canvas.height) return canvas.height;
    if (canvas.minHeight) return canvas.minHeight;
    return DEFERRAL_CARD_CANVAS_HEIGHT;
}

export function normalizeCanvasRecord(canvas: DeferralCardCanvas): DeferralCardCanvas {
    const { width, height } = clampCardSize(canvas.width ?? DEFERRAL_CARD_CANVAS_WIDTH, resolveCanvasHeight(canvas));
    return {
        width,
        height,
        elements: normalizeCanvasElements(splitMultilineElements(coerceCanvasElements(canvas.elements)), width, height),
    };
}

export function canvasFromLayoutBlocks(
    blocks: DeferralLayoutBlock[],
    template: DeferralCardTemplate,
): DeferralCardCanvas {
    const { width, height } = clampCardSize(DEFERRAL_CARD_CANVAS_WIDTH, DEFERRAL_CARD_CANVAS_HEIGHT);
    return {
        width,
        height,
        elements: buildStudioDefaultElements(template, '', width, height),
    };
}

export function layoutBlocksFromCanvas(canvas: DeferralCardCanvas): DeferralLayoutBlock[] {
    return [...canvas.elements]
        .filter((e) => e.enabled !== false)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((e) => ({
            id: e.id,
            type: e.type === 'text' ? 'paragraph' : e.type,
            content: e.content,
            enabled: e.enabled,
        }));
}

export function bodyTemplateFromCanvasElements(elements: DeferralCanvasElement[]): string {
    const lines = [...elements]
        .filter((e) => e.enabled !== false && (e.type === 'text' || e.type === 'paragraph'))
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((e) => e.content?.trim())
        .filter(Boolean);
    if (!lines.length) return '{customMessage}';
    if (lines.length === 1) return lines[0]!;
    return lines.join('<br>');
}

function legacyBlocksForTemplate(template: DeferralCardTemplate): DeferralLayoutBlock[] {
    const title = typeof template.title === 'string' ? template.title : 'Access Denied';
    const body = typeof template.bodyTemplate === 'string' ? template.bodyTemplate : '';
    const blocks: DeferralLayoutBlock[] = [
        { id: 'heading', type: 'heading', content: title, enabled: true },
        { id: 'body', type: 'paragraph', content: body, enabled: true },
    ];
    if (template.showRequestId !== false) {
        blocks.push({ id: 'request_id', type: 'request_id', enabled: true });
    }
    if (template.showTierName === true) {
        blocks.push({ id: 'tier_name', type: 'tier_name', enabled: true });
    }
    blocks.push({ id: 'logo', type: 'logo', enabled: true });
    return blocks;
}

function coerceBlockContent(content: unknown): string | undefined {
    if (content === undefined || content === null) return undefined;
    return typeof content === 'string' ? content : String(content);
}

/** Normalizes legacy/API shapes before sync, save, or export. */
export function finalizeCanvasElementsForSave(elements: DeferralCanvasElement[]): DeferralCanvasElement[] {
    return elements.map((el) =>
        el.type === 'button' && el.content?.trim() ? { ...el, content: finalizeDeferralButtonContent(el.content) } : el,
    );
}

export function sanitizeDeferralCardTemplate(template: DeferralCardTemplate): DeferralCardTemplate {
    const layout = template.layout;
    const blocks = Array.isArray(layout?.blocks)
        ? (layout.blocks
              .map((block) => {
                  if (!block || typeof block !== 'object') return null;
                  const b = block as DeferralLayoutBlock;
                  const parsed = DeferralBlockTypeSchema.safeParse(b.type);
                  if (!parsed.success) return null;
                  const id = typeof b.id === 'string' && b.id.trim() ? b.id.trim() : createDeferralBlockId();
                  return {
                      id,
                      type: parsed.data,
                      content: coerceBlockContent(b.content),
                      enabled: b.enabled !== false,
                  };
              })
              .filter((b) => b !== null) as DeferralLayoutBlock[])
        : undefined;

    const canvasElements = coerceCanvasElements(layout?.canvas?.elements);
    const canvas = layout?.canvas
        ? normalizeCanvasRecord({
              width: layout.canvas.width,
              height: layout.canvas.height,
              minHeight: layout.canvas.minHeight,
              elements: canvasElements,
          })
        : undefined;

    return {
        ...template,
        title: typeof template.title === 'string' ? template.title : 'Access Denied',
        bodyTemplate: typeof template.bodyTemplate === 'string' ? template.bodyTemplate : '',
        showRequestId: template.showRequestId !== false,
        showTierName: template.showTierName === true,
        customPlaceholders: normalizeCustomPlaceholders(template.customPlaceholders),
        layout: layout
            ? {
                  version: layout.version === 1 ? 1 : 2,
                  blocks: blocks ?? [],
                  canvas,
              }
            : undefined,
    };
}

export function getTemplateCanvas(template: DeferralCardTemplate): DeferralCardCanvas {
    const safe = sanitizeDeferralCardTemplate(template);
    if (safe.layout?.canvas?.elements?.length) {
        return normalizeCanvasRecord(safe.layout.canvas);
    }
    const blocks = safe.layout?.blocks?.length ? safe.layout.blocks : legacyBlocksForTemplate(safe);
    return canvasFromLayoutBlocks(blocks, safe);
}

export function defaultCanvasForScenario(scenarioId: DeferralScenarioId, sampleBody = ''): DeferralCardCanvas {
    const template = DEFAULT_DEFERRAL_CARD_TEMPLATES[scenarioId];
    if (template.layout?.canvas?.elements?.length) {
        return getTemplateCanvas(template);
    }
    const { width, height } = clampCardSize(DEFERRAL_CARD_CANVAS_WIDTH, DEFERRAL_CARD_CANVAS_HEIGHT);
    return {
        width,
        height,
        elements: buildStudioDefaultElements(template, sampleBody, width, height, scenarioId),
    };
}

export function createCanvasElement(
    type: DeferralBlockType,
    y = 0,
    cardWidth = DEFERRAL_CARD_CANVAS_WIDTH,
): DeferralCanvasElement {
    const meta = DEFERRAL_BLOCK_META[type];
    const contentWidth = getCanvasContentWidth(cardWidth);
    const el: DeferralCanvasElement = {
        id: createDeferralBlockId(),
        type,
        x: 0,
        y,
        enabled: true,
        content: meta.defaultContent ?? '',
        style:
            type === 'heading'
                ? { fontSize: 22, fontWeight: 'bold' }
                : type === 'request_id' || type === 'ban_id' || type === 'ban_expires' || type === 'tier_name'
                  ? { fontSize: 18 }
                  : type === 'ban_reason'
                    ? { fontSize: 16 }
                    : { fontSize: 18 },
    };
    const size = estimateCanvasElementSize(el, contentWidth);
    if (type === 'logo') {
        return {
            ...el,
            x: 0,
            y: 0,
            width: undefined,
            height: undefined,
        };
    }
    if (type === 'custom_image') {
        return {
            ...el,
            x: snapDeferralCoord(Math.max(0, contentWidth - 96)),
            width: 96,
            height: 96,
            content: el.content ? normalizeDeferralImageContent(el.content) : '',
        };
    }
    if (type === 'button') {
        const btn = parseDeferralButtonContent(el.content);
        const size = estimateCanvasElementSize(
            { ...el, type: 'button', content: serializeDeferralButtonContent(btn, { sanitizeColors: false }) },
            contentWidth,
        );
        return {
            ...el,
            content: serializeDeferralButtonContent(btn, { sanitizeColors: false }),
            width: size.width,
            height: size.height,
            style: { fontSize: 16, ...el.style },
        };
    }
    if (type === 'divider') {
        return { ...el, width: contentWidth, height: 12 };
    }
    return { ...el, width: size.width, height: size.height };
}

export function templateWithCanvas(template: DeferralCardTemplate, canvas: DeferralCardCanvas): DeferralCardTemplate {
    const normalized = normalizeCanvasRecord(canvas);
    const blocks = layoutBlocksFromCanvas(normalized);
    const heading = blocks.find((b) => b.type === 'heading');
    const bodyFromCanvas = bodyTemplateFromCanvasElements(normalized.elements);
    return {
        ...template,
        layout: {
            version: 2,
            blocks,
            canvas: normalized,
        },
        title: heading?.content?.trim() || template.title,
        bodyTemplate: bodyFromCanvas,
        showRequestId: normalized.elements.some((b) => b.type === 'request_id' && b.enabled !== false),
        showTierName: normalized.elements.some((b) => b.type === 'tier_name' && b.enabled !== false),
        customPlaceholders: normalizeCustomPlaceholders(template.customPlaceholders),
    };
}

export function templateHasCanvasLayout(template: DeferralCardTemplate): boolean {
    return Boolean(template.layout?.canvas?.elements?.length);
}

export function loadStudioCanvasElements(
    tpl: DeferralCardTemplate,
    scenarioId: DeferralScenarioId | string,
    sampleBody: string,
): DeferralCanvasElement[] {
    const canvas = getTemplateCanvas(tpl);
    const hasSavedCanvas = Boolean(tpl.layout?.canvas?.elements?.length);
    let elements = hasSavedCanvas
        ? canvas.elements
        : buildStudioDefaultElements(tpl, sampleBody, canvas.width, resolveCanvasHeight(canvas), scenarioId);
    elements = splitMultilineElements(elements);
    return normalizeCanvasElements(elements, canvas.width, resolveCanvasHeight(canvas));
}
