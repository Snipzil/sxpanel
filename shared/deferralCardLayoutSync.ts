import type { DeferralCardTemplate } from './deferralCardTypes';
import {
    coerceCanvasElements,
    getTemplateCanvas,
    sanitizeDeferralCardTemplate,
    templateWithCanvas,
} from './deferralCardCanvas';
import {
    normalizeCustomPlaceholders,
    type DeferralCardLayout,
    type DeferralLayoutBlock,
} from './deferralCardLayoutCore';

/** Converts legacy title/body toggles into a block list for the visual editor. */
export function layoutFromLegacyTemplate(template: DeferralCardTemplate): DeferralCardLayout {
    const safe = sanitizeDeferralCardTemplate(template);
    const blocks: DeferralLayoutBlock[] = [
        { id: 'heading', type: 'heading', content: safe.title, enabled: true },
        { id: 'body', type: 'paragraph', content: safe.bodyTemplate, enabled: true },
    ];
    if (safe.showRequestId) {
        blocks.push({ id: 'request_id', type: 'request_id', enabled: true });
    }
    if (safe.showTierName) {
        blocks.push({ id: 'tier_name', type: 'tier_name', enabled: true });
    }
    blocks.push({ id: 'logo', type: 'logo', enabled: true });
    return { version: 2, blocks };
}

export function syncLegacyFieldsFromLayout(template: DeferralCardTemplate): DeferralCardTemplate {
    const safe = sanitizeDeferralCardTemplate(template);
    const canvasElements = coerceCanvasElements(safe.layout?.canvas?.elements);
    if (canvasElements.length) {
        return templateWithCanvas(safe, getTemplateCanvas(safe));
    }
    const layout = safe.layout ?? layoutFromLegacyTemplate(safe);
    const heading = layout.blocks.find((b) => b.type === 'heading' && b.enabled !== false);
    const paragraph = layout.blocks.find((b) => b.type === 'paragraph' && b.enabled !== false);
    const showRequestId = layout.blocks.some((b) => b.type === 'request_id' && b.enabled !== false);
    const showTierName = layout.blocks.some((b) => b.type === 'tier_name' && b.enabled !== false);
    const paragraphBody =
        typeof paragraph?.content === 'string' && paragraph.content.trim()
            ? paragraph.content
            : typeof safe.bodyTemplate === 'string' && safe.bodyTemplate.trim()
              ? safe.bodyTemplate
              : '{customMessage}';
    return {
        ...safe,
        layout,
        title: typeof heading?.content === 'string' && heading.content.trim() ? heading.content : safe.title,
        bodyTemplate: paragraphBody,
        showRequestId,
        showTierName,
        customPlaceholders: normalizeCustomPlaceholders(safe.customPlaceholders),
    };
}
