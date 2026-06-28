import type { DeferralCardTemplate, DeferralCardsConfig, DeferralScenarioId } from './deferralCardTypes';
import { isAddonDeferralScenarioId } from './deferralAddonTypes';
import {
    DEFAULT_DEFERRAL_CARDS_CONFIG,
    deferralCardAssetPath,
    DEFERRAL_SCENARIO_META,
    DEFERRAL_WATERMARK_INSET_PX,
    DEFERRAL_WATERMARK_MAX_HEIGHT_PX,
    DEFERRAL_WATERMARK_MAX_WIDTH_PX,
    DEFERRAL_WATERMARK_OPACITY,
    DeferralCardsConfigSchema,
    applySharedPlaceholdersToDeferralConfig,
    normalizeDeferralCardsConfig,
    resolveDeferralDiscordInvite,
    resolveDeferralScenarioShowLogo,
} from './deferralCardTypes';
import { DEFERRAL_CARD_LOGO_PATH, DEFERRAL_CARD_WATERMARK_PATH } from './deferralCardLogo';
import type { DeferralBanTokenFields } from './deferralCardBan';
import { isBanExpiresCanvasContent, isBanReasonCanvasContent, resolveDeferralElementContent } from './deferralCardBan';
import type { DeferralCustomPlaceholder } from './deferralCardLayout';
import {
    clampCardHeight,
    coerceCanvasElements,
    DEFERRAL_CARD_CANVAS_HEIGHT,
    DEFERRAL_CARD_CANVAS_WIDTH,
    DEFERRAL_CARD_PADDING,
    estimateCanvasElementSize,
    estimateWrappedTextHeight,
    getCanvasContentWidth,
    getTemplateCanvas,
    normalizeCanvasRecord,
    resolveCanvasHeight,
    resolveDeferralLogoPlacement,
    resolveTextLineContent,
    splitCustomMessageParts,
    stripHtmlForMeasure,
    templateHasCanvasLayout,
    templateWithCanvas,
} from './deferralCardCanvas';
import type { DeferralCanvasElement, DeferralCardCanvas } from './deferralCardCanvas';
import { sanitizeDeferralCardTemplate, finalizeCanvasElementsForSave } from './deferralCardCanvas';
import { parseDeferralButtonContent, renderDeferralButtonAnchorHtml } from './deferralCardButton';
import {
    isDeferralGifDataUri,
    isDeferralHttpImageDataUri,
    isDeferralPngDataUri,
    renderDeferralInlineSvgMarkup,
} from './deferralCardSvg';
import {
    layoutFromLegacyTemplate,
    normalizeCustomPlaceholders,
    syncLegacyFieldsFromLayout,
    templateHasVisualLayout,
    type DeferralLayoutBlock,
} from './deferralCardLayout';

export type ResolveDeferralLogoUrlInput = {
    txaUrl?: string | null;
    txaPort?: number;
    netInterface?: string | null;
};

/** Absolute URL for the deferral watermark (FiveM clients cannot load panel-relative paths). */
export function resolveDeferralLogoUrl(input: ResolveDeferralLogoUrlInput = {}): string {
    const { txaUrl, txaPort = 40120, netInterface } = input;
    if (txaUrl?.trim()) {
        const base = txaUrl.trim().replace(/\/+$/, '');
        return `${base}${DEFERRAL_CARD_WATERMARK_PATH}`;
    }
    const host =
        netInterface && netInterface !== '0.0.0.0'
            ? netInterface.includes(':')
                ? `[${netInterface}]`
                : netInterface
            : '127.0.0.1';
    return `http://${host}:${txaPort}${DEFERRAL_CARD_WATERMARK_PATH}`;
}

export type DeferralCardTokens = DeferralBanTokenFields & {
    requestId?: string;
    tierName?: string;
    customMessage?: string;
    guildName?: string;
    discordInvite?: string;
    serverName?: string;
    playerName?: string;
    queuePosition?: string;
    queueSize?: string;
    queueEta?: string;
    title?: string;
    body?: string;
};

export type DeferralCardRenderContext = {
    scenarioId?: DeferralScenarioId;
    assetBaseUrl?: string | null;
};

export function resolveDeferralAssetBaseUrl(input: ResolveDeferralLogoUrlInput): string | null {
    const { txaUrl, txaPort = 40120, netInterface } = input;
    if (txaUrl?.trim()) {
        return txaUrl.trim().replace(/\/+$/, '');
    }
    const host =
        netInterface && netInterface !== '0.0.0.0'
            ? netInterface.includes(':')
                ? `[${netInterface}]`
                : netInterface
            : null;
    if (!host) return null;
    return `http://${host}:${txaPort}`;
}

function preprocessCanvasText(raw: string, tokens: DeferralCardTokens): string {
    return resolveDeferralElementContent(raw, tokens);
}

/** Request ID for whitelist; falls back to ban action ID on ban cards. */
export function resolveDeferralIdDisplay(
    tokens: DeferralCardTokens,
): { label: 'Request ID' | 'Ban ID'; id: string } | null {
    if (tokens.requestId) return { label: 'Request ID', id: tokens.requestId };
    if (tokens.banId) return { label: 'Ban ID', id: tokens.banId };
    return null;
}

/** FiveM deferral UI only allows standard tags — never emit raw `<codeid>` in canvas output. */
export function formatDeferralActionIdHtml(id: string): string {
    const safe = id.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    return `${htmlCodeIdTag}${safe}</code>`;
}

/** Divider line using div (FiveM often drops `<hr>`). */
const DEFERRAL_DIVIDER_HTML =
    '<div style="border-top:1px solid rgba(255,255,255,0.14);width:100%;height:0;margin:0;padding:0;font-size:0;line-height:0"></div>';

/** True when HTML has no visible text (used to skip empty ticket / supplemental boxes). */
export function deferralSupplementalMessageEmpty(html: string): boolean {
    const stripped = html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim();
    return !stripped;
}

function formatDeferralCanvasIdLine(label: string, idHtml: string, fontSize: number): string {
    return (
        `<p style="margin:0;font-size:${fontSize}px;line-height:1.35;white-space:nowrap">` +
        `<span style="opacity:0.6;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;margin-right:10px;">${label}</span>` +
        `<span style="display:inline-block;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,0.07);` +
        `border:1px solid rgba(255,255,255,0.12);">${idHtml}</span></p>`
    );
}

import {
    DEFERRAL_TXADMIN_WATERMARK_BOTTOM_PX,
    DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX,
    DEFERRAL_TXADMIN_WATERMARK_OPACITY,
    DEFERRAL_TXADMIN_WATERMARK_RIGHT_PX,
    DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX,
} from './deferralCardWatermark';

/** sxPanel watermark — txAdmin placement (bottom-right, 28px) or canvas absolute coords. */
export function renderDeferralWatermarkLogoHtml(
    logoSrc: string,
    placement?: { x: number; y: number; width: number; height: number },
): string {
    const safeLogoSrc = logoSrc.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    if (!placement) {
        return (
            `<img src="${safeLogoSrc}" alt="" style="width:${DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX}px;` +
            `height:${DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX}px;object-fit:contain;` +
            `position:absolute;right:${DEFERRAL_TXADMIN_WATERMARK_RIGHT_PX}px;` +
            `bottom:${DEFERRAL_TXADMIN_WATERMARK_BOTTOM_PX}px;` +
            `opacity:${DEFERRAL_TXADMIN_WATERMARK_OPACITY};display:block;pointer-events:none">`
        );
    }
    const width =
        placement.width <= DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX + 4
            ? DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX
            : placement.width;
    const height =
        placement.height <= DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX + 4
            ? DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX
            : placement.height;
    return (
        `<img src="${safeLogoSrc}" alt="" style="position:absolute;left:${placement.x}px;top:${placement.y}px;` +
        `width:${width}px;height:${height}px;object-fit:contain;opacity:${DEFERRAL_TXADMIN_WATERMARK_OPACITY};` +
        `display:block;pointer-events:none">`
    );
}

function isDeferralWatermarkVisible(template: DeferralCardTemplate, showLogo: boolean): boolean {
    if (!showLogo) return false;
    const logoEl = getTemplateCanvas(template).elements.find((el) => el.type === 'logo');
    if (!logoEl) return true;
    return logoEl.enabled !== false;
}

function resolveDeferralImageImgSrc(
    stored: string,
    element: { id?: string },
    renderCtx: DeferralCardRenderContext,
): string {
    const trimmed = stored.trim();
    if (!trimmed) return '';

    if (isDeferralHttpImageDataUri(trimmed) && renderCtx.assetBaseUrl && renderCtx.scenarioId && element.id) {
        const ext = isDeferralGifDataUri(trimmed) ? 'gif' : isDeferralPngDataUri(trimmed) ? 'png' : undefined;
        return `${renderCtx.assetBaseUrl}${deferralCardAssetPath(renderCtx.scenarioId, element.id, ext)}`;
    }

    if (isDeferralHttpImageDataUri(trimmed)) return trimmed;
    return '';
}

function renderDeferralCanvasCustomImage(
    el: DeferralCanvasElement,
    stored: string,
    cardContentWidth: number,
    renderCtx: DeferralCardRenderContext,
): string {
    const box = canvasElementStyle(el, cardContentWidth);
    const imgSrc = resolveDeferralImageImgSrc(stored, el, renderCtx);
    if (imgSrc) {
        const safeSrc = imgSrc.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
        // Match logo: one positioned node only (wrapped img doubled left/top and hid the image in FiveM).
        return `<img src="${safeSrc}" alt="" style="${box};object-fit:contain;pointer-events:none;display:block">`;
    }
    // Legacy SVG-only configs: inline markup (FiveM blocks data:/HTTP SVG on img).
    return renderDeferralInlineSvgMarkup(stored, box);
}

function renderDeferralCustomImageHtml(
    stored: string,
    boxStyle: string,
    element: DeferralCanvasElement | DeferralLayoutBlock,
    renderCtx: DeferralCardRenderContext,
): string {
    const imgSrc = resolveDeferralImageImgSrc(stored, element, renderCtx);
    if (!imgSrc) return '';
    const safeSrc = imgSrc.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
    return `<img src="${safeSrc}" alt="" style="${boxStyle};object-fit:contain;pointer-events:none">`;
}

const htmlCodeTag = '<code style="background-color: hsl(202deg 40% 66% / 35%); padding: 2px 2px; border-radius: 4px;">';
const htmlCodeIdTag =
    '<code style="letter-spacing: 2px; background-color: #ff7f5059; padding: 2px 4px; border-radius: 6px;">';
const htmlGuildNameTag = '<strong style="color: cornflowerblue">';

export function prepCustomMessage(msg: string) {
    if (!msg) return '';
    return '<br>' + msg.trim().replaceAll(/\n/g, '<br>');
}

export function applyCustomPlaceholders(
    template: string,
    placeholders: DeferralCustomPlaceholder[],
    sanitizeValue: (value: string) => string = (v) => v,
) {
    let content = template;
    for (const row of normalizeCustomPlaceholders(placeholders)) {
        content = content.replaceAll(`{${row.key}}`, sanitizeValue(row.value));
    }
    return content;
}

export function applyDeferralMarkupTags(content: string) {
    let out = content;
    out = out.replaceAll('<guildname>', htmlGuildNameTag).replaceAll('</guildname>', '</strong>');
    out = out.replaceAll('<code>', htmlCodeTag);
    out = out.replaceAll('<codeid>', htmlCodeIdTag).replaceAll('</codeid>', '</code>');
    return out;
}

/** Applies placeholder tokens without XSS sanitization (panel preview only). */
export function applyDeferralTokensPreview(
    template: string,
    tokens: DeferralCardTokens,
    customPlaceholders: DeferralCustomPlaceholder[] = [],
) {
    let content = template;
    content = content.replaceAll('{requestId}', tokens.requestId ?? 'R12345');
    content = content.replaceAll('{tierName}', tokens.tierName ?? 'Default');
    content = content.replaceAll('{customMessage}', prepCustomMessage(tokens.customMessage ?? ''));
    content = content.replaceAll('{guildName}', tokens.guildName ?? 'Your Discord');
    content = content.replaceAll('{discordInvite}', tokens.discordInvite ?? 'https://discord.gg/example');
    content = content.replaceAll('{serverName}', tokens.serverName ?? 'change-me');
    content = content.replaceAll('{playerName}', tokens.playerName ?? 'player');
    content = content.replaceAll('{queuePosition}', tokens.queuePosition ?? '1');
    content = content.replaceAll('{queueSize}', tokens.queueSize ?? '1');
    content = content.replaceAll('{queueEta}', tokens.queueEta ?? '');
    content = content.replaceAll('{banReason}', tokens.banReason ?? 'Example ban');
    content = content.replaceAll('{banExpires}', tokens.banExpires ?? 'in 2 days');
    content = content.replaceAll('{banId}', tokens.banId ?? 'A12345');
    content = content.replaceAll('{banDate}', tokens.banDate ?? 'Jan 1, 2026');
    content = content.replaceAll('{banAuthor}', tokens.banAuthor ?? 'Admin');
    content = applyCustomPlaceholders(content, customPlaceholders);
    return applyDeferralMarkupTags(content);
}

type RenderLayoutBlockInput = {
    block: DeferralLayoutBlock;
    template: DeferralCardTemplate;
    tokens: DeferralCardTokens;
    showLogo: boolean;
    logoSrc: string;
    renderCtx: DeferralCardRenderContext;
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string;
};

function renderLayoutBlock(input: RenderLayoutBlockInput): string {
    const { block, template, tokens, showLogo, logoSrc, renderCtx, applyTokens } = input;
    if (block.enabled === false) return '';

    switch (block.type) {
        case 'heading': {
            const text = block.content?.trim() || template.title || tokens.title || 'Access Denied';
            return `<h2 style="margin:0 0 8px">${applyTokens(text, tokens, template.customPlaceholders)}</h2>`;
        }
        case 'paragraph': {
            const raw = block.content?.trim() ? block.content : template.bodyTemplate || '{customMessage}';
            return `<p style="font-size:1.25rem;margin:0;padding:0">${applyTokens(raw, tokens, template.customPlaceholders)}</p>`;
        }
        case 'rejection_message': {
            const raw = preprocessCanvasText(tokens.customMessage ?? '', tokens);
            return `<p style="font-size:1.25rem;margin:0;padding:0;white-space:pre-wrap;overflow-wrap:break-word">${applyTokens(raw, tokens, template.customPlaceholders)}</p>`;
        }
        case 'text':
        case 'custom_text': {
            const raw = preprocessCanvasText(block.content?.trim() ?? '', tokens);
            return `<p style="font-size:1.25rem;margin:0;padding:0;white-space:pre-wrap">${applyTokens(raw, tokens, template.customPlaceholders)}</p>`;
        }
        case 'custom_image': {
            const stored = block.content?.trim() ?? '';
            return renderDeferralCustomImageHtml(stored, 'max-width:180px;max-height:96px', block, renderCtx);
        }
        case 'button': {
            const btn = parseDeferralButtonContent(block.content);
            const label = applyTokens(btn.label, tokens, template.customPlaceholders);
            const url = applyDeferralTokensPreview(btn.url, tokens, template.customPlaceholders);
            const html = renderDeferralButtonAnchorHtml(label, url, btn);
            return html ? `<p style="margin:8px 0 0">${html}</p>` : '';
        }
        case 'request_id': {
            const display = resolveDeferralIdDisplay(tokens);
            if (!display) return '';
            return `<p style="margin:8px 0 0"><strong>${display.label}:</strong> ${formatDeferralActionIdHtml(display.id)}</p>`;
        }
        case 'ban_id':
            if (!tokens.banId) return '';
            return `<p style="margin:8px 0 0"><strong>Ban ID:</strong> ${formatDeferralActionIdHtml(tokens.banId)}</p>`;
        case 'ban_reason':
            if (!tokens.banReason) return '';
            return `<p style="margin:8px 0 0"><strong>Reason:</strong> ${tokens.banReason}</p>`;
        case 'ban_expires':
            if (!tokens.banExpires) return '';
            return `<p style="margin:8px 0 0"><strong>Expires:</strong> ${tokens.banExpires}</p>`;
        case 'tier_name':
            if (!template.showTierName || !tokens.tierName) return '';
            return `<p style="margin:8px 0 0"><strong>Tier:</strong> ${tokens.tierName}</p>`;
        case 'spacer':
            return '<div style="height:16px"></div>';
        case 'divider':
            return DEFERRAL_DIVIDER_HTML;
        case 'logo':
            return '';
        default:
            return '';
    }
}

export type BuildDeferralCardFromLayoutOptions = {
    applyTokens?: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string;
    renderCtx?: DeferralCardRenderContext;
};

type RenderCanvasElementInput = {
    element: DeferralCanvasElement;
    template: DeferralCardTemplate;
    tokens: DeferralCardTokens;
    showLogo: boolean;
    logoSrc: string;
    renderCtx: DeferralCardRenderContext;
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string;
    textLineIndex: number;
    messageParts: string[];
    cardContentWidth: number;
};

const CANVAS_TEXT_LIKE_TYPES = new Set<DeferralCanvasElement['type']>([
    'heading',
    'text',
    'paragraph',
    'custom_text',
    'request_id',
    'ban_id',
    'ban_expires',
    'tier_name',
]);

/** FiveM defers to estimated box widths and breaks words mid-line — use min-width + nowrap instead. */
function canvasElementStyle(el: DeferralCanvasElement, cardContentWidth: number): string {
    const parts = ['position:absolute', `left:${el.x}px`, `top:${el.y}px`, 'box-sizing:border-box'];
    const isTextLike = CANVAS_TEXT_LIKE_TYPES.has(el.type);

    if (el.type === 'rejection_message' || el.type === 'ban_reason') {
        parts.push(`width:${Math.max(48, cardContentWidth - el.x)}px`);
    } else if (isTextLike) {
        const minW = el.width ?? 64;
        parts.push(`min-width:${minW}px`);
        parts.push(`max-width:${Math.max(48, cardContentWidth - el.x)}px`);
        parts.push('width:max-content');
    } else {
        if (el.width) parts.push(`width:${el.width}px`);
    }
    if (el.height && !isTextLike) parts.push(`height:${el.height}px`);
    if (el.style?.fontSize) parts.push(`font-size:${el.style.fontSize}px`);
    if (el.style?.color) parts.push(`color:${el.style.color}`);
    if (el.style?.textAlign) parts.push(`text-align:${el.style.textAlign}`);
    if (el.style?.fontWeight) parts.push(`font-weight:${el.style.fontWeight}`);
    return parts.join(';');
}

/** Whether this element wraps at render time (must match height fitting). */
export function canvasElementWrapsAtRender(el: DeferralCanvasElement, tokens: DeferralBanTokenFields): boolean {
    if (el.type === 'rejection_message') return true;
    if (el.type === 'custom_text' && (el.content ?? '').includes('\n')) return true;
    const raw = el.content ?? '';
    if (
        (el.type === 'paragraph' || el.type === 'text' || el.type === 'custom_text') &&
        raw.includes('{customMessage}')
    ) {
        return true;
    }
    if (el.type === 'paragraph' || el.type === 'text' || el.type === 'custom_text') {
        if (raw.includes('<br') || raw.includes('\n')) return true;
        if (isBanReasonCanvasContent(raw) || isBanExpiresCanvasContent(raw)) return true;
    }
    return false;
}

function textWrapStyle(el: DeferralCanvasElement, tokens: DeferralBanTokenFields): string {
    if (canvasElementWrapsAtRender(el, tokens)) {
        return 'white-space:pre-wrap;overflow-wrap:break-word';
    }
    return 'white-space:nowrap';
}

function elementMaxTextWidth(el: DeferralCanvasElement, cardContentWidth: number): number {
    if (el.type === 'rejection_message') {
        return Math.max(48, cardContentWidth - el.x);
    }
    if (CANVAS_TEXT_LIKE_TYPES.has(el.type) || el.type === 'custom_text') {
        return Math.max(48, cardContentWidth - el.x);
    }
    return el.width ?? cardContentWidth;
}

function resolveCanvasElementPlainText(
    el: DeferralCanvasElement,
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    textLineIndex: number,
    messageParts: string[],
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string,
): string {
    const apply = (text: string) =>
        stripHtmlForMeasure(applyTokens(preprocessCanvasText(text, tokens), tokens, template.customPlaceholders));

    switch (el.type) {
        case 'rejection_message':
            return apply(tokens.customMessage ?? '');
        case 'text': {
            const html = resolveTextLineContent(el, tokens, template, textLineIndex, messageParts, (text) =>
                applyTokens(preprocessCanvasText(text, tokens), tokens, template.customPlaceholders),
            );
            return stripHtmlForMeasure(html);
        }
        case 'custom_text':
            return apply(el.content?.trim() ?? '');
        case 'paragraph': {
            const raw = el.content?.trim() ? el.content : template.bodyTemplate || '{customMessage}';
            if (raw.includes('{customMessage}') && messageParts.length > 1) {
                const html = resolveTextLineContent(
                    { ...el, content: '{customMessage}' },
                    tokens,
                    template,
                    textLineIndex,
                    messageParts,
                    (text) => applyTokens(preprocessCanvasText(text, tokens), tokens, template.customPlaceholders),
                );
                return stripHtmlForMeasure(html);
            }
            return apply(raw);
        }
        case 'heading':
            return apply(el.content?.trim() || template.title || tokens.title || 'Access Denied');
        default:
            return '';
    }
}

function measureCanvasElementHeight(
    el: DeferralCanvasElement,
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    cardContentWidth: number,
    textLineIndex: number,
    messageParts: string[],
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string,
): number {
    const fontSize = el.style?.fontSize ?? (el.type === 'heading' ? 22 : 18);

    if (canvasElementWrapsAtRender(el, tokens)) {
        const plain = resolveCanvasElementPlainText(el, template, tokens, textLineIndex, messageParts, applyTokens);
        return estimateWrappedTextHeight(plain, fontSize, elementMaxTextWidth(el, cardContentWidth));
    }

    if (el.height) return el.height;
    return estimateCanvasElementSize(el, cardContentWidth).height;
}

/** Grows canvas height when wrapped rejection/ban text would clip (render-time only). */
export function fitCanvasHeightForContent(
    canvas: DeferralCardCanvas,
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    showLogo: boolean,
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string,
): DeferralCardCanvas {
    const width = canvas.width ?? DEFERRAL_CARD_CANVAS_WIDTH;
    const cardContentWidth = getCanvasContentWidth(width);
    const baseHeight = resolveCanvasHeight(canvas);
    const baseInner = baseHeight - DEFERRAL_CARD_PADDING * 2;
    const messageParts = splitCustomMessageParts(tokens.customMessage ?? '');
    const textElements = canvas.elements
        .filter((e) => (e.type === 'text' || e.type === 'paragraph') && e.enabled !== false)
        .sort((a, b) => a.y - b.y || a.x - b.x);

    let maxBottom = 0;
    for (const el of canvas.elements) {
        if (el.enabled === false || el.type === 'logo') continue;
        const isTextLine = el.type === 'text' || el.type === 'paragraph';
        const textLineIndex = isTextLine ? textElements.findIndex((t) => t.id === el.id) : -1;
        const height = measureCanvasElementHeight(
            el,
            template,
            tokens,
            cardContentWidth,
            isTextLine ? textLineIndex : 0,
            messageParts,
            applyTokens,
        );
        maxBottom = Math.max(maxBottom, el.y + height);
    }

    const watermarkVisible = isDeferralWatermarkVisible(template, showLogo);
    const watermarkReserve = watermarkVisible ? DEFERRAL_WATERMARK_MAX_HEIGHT_PX + DEFERRAL_WATERMARK_INSET_PX + 8 : 8;
    const requiredInner = Math.max(baseInner, maxBottom + watermarkReserve);
    const newHeight = clampCardHeight(requiredInner + DEFERRAL_CARD_PADDING * 2);
    if (newHeight <= baseHeight) return canvas;
    return { ...canvas, height: newHeight };
}

function renderCanvasElement(input: RenderCanvasElementInput): string {
    const {
        element: el,
        template,
        tokens,
        showLogo,
        logoSrc,
        renderCtx,
        applyTokens,
        textLineIndex,
        messageParts,
        cardContentWidth,
    } = input;
    if (el.enabled === false) return '';

    const wrap = (inner: string) => `<div style="${canvasElementStyle(el, cardContentWidth)}">${inner}</div>`;
    const fontSize = el.style?.fontSize ?? 20;
    const wrapCss = textWrapStyle(el, tokens);

    switch (el.type) {
        case 'heading': {
            const text = preprocessCanvasText(
                el.content?.trim() || template.title || tokens.title || 'Access Denied',
                tokens,
            );
            return wrap(
                `<h2 style="margin:0;white-space:nowrap;font-weight:bold">${applyTokens(text, tokens, template.customPlaceholders)}</h2>`,
            );
        }
        case 'text': {
            const html = resolveTextLineContent(el, tokens, template, textLineIndex, messageParts, (text) =>
                applyTokens(preprocessCanvasText(text, tokens), tokens, template.customPlaceholders),
            );
            return wrap(
                `<p style="margin:0;padding:0;font-size:${fontSize}px;line-height:1.35;${wrapCss}">${html}</p>`,
            );
        }
        case 'custom_text': {
            const raw = preprocessCanvasText(el.content?.trim() ?? '', tokens);
            const html = applyTokens(raw, tokens, template.customPlaceholders);
            if (raw.includes('{customMessage}') && deferralSupplementalMessageEmpty(html)) {
                return '';
            }
            return wrap(
                `<p style="margin:0;padding:0;font-size:${fontSize}px;line-height:1.35;${wrapCss}">${html}</p>`,
            );
        }
        case 'rejection_message': {
            const raw = preprocessCanvasText(tokens.customMessage ?? '', tokens);
            const html = applyTokens(raw, tokens, template.customPlaceholders);
            return wrap(
                `<p style="margin:0;padding:0;font-size:${fontSize}px;line-height:1.35;${wrapCss}">${html}</p>`,
            );
        }
        case 'paragraph': {
            const raw = el.content?.trim() ? el.content : template.bodyTemplate || '{customMessage}';
            const html =
                raw.includes('{customMessage}') && messageParts.length > 1
                    ? resolveTextLineContent(
                          { ...el, content: '{customMessage}' },
                          tokens,
                          template,
                          textLineIndex,
                          messageParts,
                          (text) =>
                              applyTokens(preprocessCanvasText(text, tokens), tokens, template.customPlaceholders),
                      )
                    : applyTokens(preprocessCanvasText(raw, tokens), tokens, template.customPlaceholders);
            return wrap(
                `<p style="margin:0;padding:0;font-size:${fontSize}px;line-height:1.35;${wrapCss}">${html}</p>`,
            );
        }
        case 'request_id': {
            const display = resolveDeferralIdDisplay(tokens);
            if (!display) return '';
            return wrap(formatDeferralCanvasIdLine(display.label, formatDeferralActionIdHtml(display.id), fontSize));
        }
        case 'ban_id':
            if (!tokens.banId) return '';
            return wrap(formatDeferralCanvasIdLine('Ban ID', formatDeferralActionIdHtml(tokens.banId), fontSize));
        case 'ban_reason':
            if (!tokens.banReason) return '';
            return wrap(
                `<p style="margin:0;font-size:${fontSize}px;line-height:1.35;white-space:pre-wrap;word-break:break-word"><strong>Reason:</strong> ${tokens.banReason}</p>`,
            );
        case 'ban_expires':
            if (!tokens.banExpires) return '';
            return wrap(
                `<p style="margin:0;font-size:${fontSize}px;line-height:1.35;white-space:nowrap"><strong>Expires:</strong> ${tokens.banExpires}</p>`,
            );
        case 'tier_name':
            if (!template.showTierName || !tokens.tierName) return '';
            return wrap(
                `<p style="margin:0;font-size:${fontSize}px;line-height:1.35;white-space:nowrap"><strong>Tier:</strong> ${tokens.tierName}</p>`,
            );
        case 'spacer':
            return wrap('<div style="height:16px"></div>');
        case 'divider':
            return wrap(DEFERRAL_DIVIDER_HTML);
        case 'logo':
            return '';
        case 'custom_image': {
            const stored = el.content?.trim() ?? '';
            return renderDeferralCanvasCustomImage(el, stored, cardContentWidth, renderCtx);
        }
        case 'button': {
            const btn = parseDeferralButtonContent(el.content);
            const label = applyTokens(btn.label, tokens, template.customPlaceholders);
            const url = applyDeferralTokensPreview(btn.url, tokens, template.customPlaceholders);
            const inner = renderDeferralButtonAnchorHtml(label, url, btn);
            if (!inner) return '';
            return wrap(
                `<div style="display:flex;align-items:center;justify-content:flex-start;width:100%;height:100%">${inner}</div>`,
            );
        }
        default:
            return '';
    }
}

function buildDeferralCardFromCanvas(
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    showLogo: boolean,
    logoSrc: string,
    applyTokens: (
        template: string,
        tokens: DeferralCardTokens,
        customPlaceholders: DeferralCustomPlaceholder[],
    ) => string,
    renderCtx: DeferralCardRenderContext = {},
) {
    // WYSIWYG: use the saved canvas size from the studio — do not auto-grow at render time.
    const canvas = getTemplateCanvas(template);
    const width = canvas.width ?? DEFERRAL_CARD_CANVAS_WIDTH;
    const cardHeight = resolveCanvasHeight(canvas);
    const innerHeight = cardHeight - DEFERRAL_CARD_PADDING * 2;
    const cardContentWidth = getCanvasContentWidth(width);
    const messageParts = splitCustomMessageParts(tokens.customMessage ?? '');
    const textElements = canvas.elements
        .filter((e) => (e.type === 'text' || e.type === 'paragraph') && e.enabled !== false)
        .sort((a, b) => a.y - b.y || a.x - b.x);
    const inner = canvas.elements
        .map((element) => {
            if (element.enabled === false) return '';
            if (element.type === 'logo') {
                if (!isDeferralWatermarkVisible(template, showLogo)) return '';
                return renderDeferralWatermarkLogoHtml(
                    logoSrc,
                    resolveDeferralLogoPlacement(element, cardContentWidth, innerHeight),
                );
            }
            const isTextLine = element.type === 'text' || element.type === 'paragraph';
            const textLineIndex = isTextLine ? textElements.findIndex((t) => t.id === element.id) : -1;
            return renderCanvasElement({
                element,
                template,
                tokens,
                showLogo,
                logoSrc,
                renderCtx,
                applyTokens,
                textLineIndex: isTextLine ? textLineIndex : 0,
                messageParts,
                cardContentWidth,
            });
        })
        .filter(Boolean)
        .join('');
    const markup = applyDeferralMarkupTags(inner);
    const innerWrapper =
        `<div style="position:relative;width:${cardContentWidth}px;min-width:${cardContentWidth}px;min-height:${innerHeight}px">` +
        `${markup}</div>`;
    return buildDeferralCardHtml('', innerWrapper, false, logoSrc, { skipTitle: true });
}

export function buildDeferralCardFromLayout(
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    showLogo: boolean,
    logoSrc: string = DEFERRAL_CARD_LOGO_PATH,
    options: BuildDeferralCardFromLayoutOptions = {},
) {
    const applyTokens = options.applyTokens ?? applyDeferralTokensPreview;
    const renderCtx = options.renderCtx ?? {};
    const synced = syncLegacyFieldsFromLayout(template);

    if (templateHasCanvasLayout(synced)) {
        return buildDeferralCardFromCanvas(synced, tokens, showLogo, logoSrc, applyTokens, renderCtx);
    }

    const layout = synced.layout ?? layoutFromLegacyTemplate(synced);
    const inner = layout.blocks
        .filter((block) => block.type !== 'logo')
        .map((block) =>
            renderLayoutBlock({ block, template: synced, tokens, showLogo, logoSrc, renderCtx, applyTokens }),
        )
        .filter(Boolean)
        .join('');
    const logoEl = getTemplateCanvas(synced).elements.find((el) => el.type === 'logo' && el.enabled !== false);
    const innerHeight = resolveCanvasHeight(getTemplateCanvas(synced)) - DEFERRAL_CARD_PADDING * 2;
    const cardContentWidth = getCanvasContentWidth(getTemplateCanvas(synced).width ?? DEFERRAL_CARD_CANVAS_WIDTH);
    const watermark = isDeferralWatermarkVisible(synced, showLogo)
        ? renderDeferralWatermarkLogoHtml(logoSrc, resolveDeferralLogoPlacement(logoEl, cardContentWidth, innerHeight))
        : '';
    return buildDeferralCardHtml('', inner + watermark, false, logoSrc, { skipTitle: true });
}

export type BuildDeferralCardHtmlOptions = {
    /** Layout mode already embeds title/body in `content`. */
    skipTitle?: boolean;
};

export function buildDeferralCardHtml(
    title: string,
    content: string,
    showLogo = true,
    logoSrc: string = DEFERRAL_CARD_LOGO_PATH,
    options: BuildDeferralCardHtmlOptions = {},
) {
    let safeContent = applyDeferralMarkupTags(content);
    const logoBlock = showLogo ? renderDeferralWatermarkLogoHtml(logoSrc) : '';
    const titleBlock = options.skipTitle ? '' : `<h2>${title}</h2><br>`;
    const bodyWrapper = options.skipTitle
        ? safeContent
        : `<p style="font-size: 1.25rem; padding: 0px">${safeContent}</p>`;
    return `
    <div style="
        background-color: rgba(30, 30, 30, 0.5);
        padding: 20px;
        border: solid 1.5px #80282B;
        border-radius: 8px;
        margin-top: 25px;
        position: relative;
    ">
        ${titleBlock}
        ${bodyWrapper}
        ${logoBlock}
    </div>`.replaceAll(/[\r\n]/g, '');
}

export type RenderDeferralCardInput = DeferralBanTokenFields & {
    /** Built-in scenario id or addon namespaced id (`addon-id:scenario_key`). */
    scenario: DeferralScenarioId | string;
    title?: string;
    body?: string;
    requestId?: string;
    tierName?: string;
    guildName?: string;
    discordInvite?: string;
    serverName?: string;
    playerName?: string;
    license?: string;
    discordId?: string;
    identifiers?: string[];
    queuePosition?: string | number | null;
    queueSize?: string | number | null;
    queueEta?: string;
    /** When set, defers to txaUrl / netInterface for custom image URLs (production). */
    assetBaseUrl?: string | null;
};

/**
 * Renders deferral HTML for panel preview (unsanitized tier names in preview only).
 */
function getPreviewScenarioTemplate(config: DeferralCardsConfig, scenarioId: string): DeferralCardTemplate {
    if (isAddonDeferralScenarioId(scenarioId)) {
        const saved = config.addonScenarios?.[scenarioId];
        if (saved) return syncLegacyFieldsFromLayout(saved);
        return syncLegacyFieldsFromLayout({
            title: 'Access Denied',
            bodyTemplate: '{customMessage}',
            showRequestId: false,
            showTierName: false,
            customPlaceholders: [],
        });
    }
    const coreId = scenarioId as DeferralScenarioId;
    return syncLegacyFieldsFromLayout(normalizedScenarioTemplate(config, coreId));
}

function normalizedScenarioTemplate(config: DeferralCardsConfig, coreId: DeferralScenarioId) {
    return config.scenarios[coreId] ?? DEFAULT_DEFERRAL_CARDS_CONFIG.scenarios[coreId];
}

export function renderDeferralCardPreview(
    config: DeferralCardsConfig,
    input: RenderDeferralCardInput,
    logoSrc: string = DEFERRAL_CARD_LOGO_PATH,
    dynamicPreviewValues: Record<string, string> = {},
): string {
    const normalized = normalizeDeferralCardsConfig(config);
    const template = getPreviewScenarioTemplate(normalized, input.scenario);
    const guildName = input.guildName ?? 'Your Discord';
    const discordInvite = input.discordInvite ?? resolveDeferralDiscordInvite(normalized);
    const showLogo = resolveDeferralScenarioShowLogo(template, normalized.skin);

    let body = input.body ?? 'Example message shown to connecting players.';
    if (template.showRequestId && !templateHasVisualLayout(template)) {
        body += `<br><strong>Request ID:</strong> <codeid>${input.requestId ?? 'R12345'}</codeid>`;
    }
    if (template.showTierName && !templateHasVisualLayout(template)) {
        body += `<br><strong>Tier:</strong> ${input.tierName ?? 'Default'}`;
    }

    const tokenPayload: DeferralCardTokens = {
        requestId: input.requestId,
        tierName: input.tierName,
        customMessage: body,
        guildName,
        discordInvite,
        serverName: input.serverName,
        playerName: input.playerName,
        queuePosition:
            input.queuePosition === null || typeof input.queuePosition === 'undefined'
                ? undefined
                : String(input.queuePosition),
        queueSize:
            input.queueSize === null || typeof input.queueSize === 'undefined' ? undefined : String(input.queueSize),
        queueEta: input.queueEta,
        title: input.title,
        body,
        banReason: input.banReason,
        banExpires: input.banExpires,
        banId: input.banId,
        banDate: input.banDate,
        banAuthor: input.banAuthor,
    };

    const assetBaseUrl =
        input.assetBaseUrl !== undefined
            ? input.assetBaseUrl
            : resolveDeferralAssetBaseUrl({ txaUrl: null, txaPort: 40120, netInterface: null });

    const applyPreview = (tpl: string, tok: DeferralCardTokens, custom: typeof template.customPlaceholders) => {
        let out = applyDeferralTokensPreview(tpl, tok, custom);
        for (const [key, val] of Object.entries(dynamicPreviewValues)) {
            out = out.replaceAll(`{${key}}`, val);
        }
        return out;
    };

    if (templateHasVisualLayout(template) || templateHasCanvasLayout(template)) {
        return buildDeferralCardFromLayout(template, tokenPayload, showLogo, logoSrc, {
            applyTokens: applyPreview,
            renderCtx: { scenarioId: input.scenario as DeferralScenarioId, assetBaseUrl },
        });
    }

    const resolvedTitle = applyPreview(
        template.title || input.title || 'Access Denied',
        tokenPayload,
        template.customPlaceholders,
    );

    const bodyTemplate = template.bodyTemplate?.trim() ? template.bodyTemplate : '{customMessage}';
    let content = applyPreview(bodyTemplate, tokenPayload, template.customPlaceholders);
    if (body.trim() && !bodyTemplate.includes('{customMessage}')) {
        content += prepCustomMessage(body);
    }

    return buildDeferralCardHtml(resolvedTitle, content, showLogo, logoSrc);
}

export function patchDeferralScenario(
    config: DeferralCardsConfig,
    scenarioId: DeferralScenarioId | string,
    template: DeferralCardTemplate,
): DeferralCardsConfig {
    const normalized = normalizeDeferralCardsConfig(config);
    const synced = syncLegacyFieldsFromLayout(template);
    if (isAddonDeferralScenarioId(scenarioId)) {
        return {
            ...normalized,
            addonScenarios: {
                ...(normalized.addonScenarios ?? {}),
                [scenarioId]: synced,
            },
        };
    }
    const coreId = scenarioId as DeferralScenarioId;
    return {
        ...normalized,
        scenarios: {
            ...normalized.scenarios,
            [coreId]: syncLegacyFieldsFromLayout({
                ...normalized.scenarios[coreId],
                ...template,
            }),
        },
    };
}

export type PrepareDeferralCardsActiveStudio = {
    scenarioId: DeferralScenarioId | string;
    baseTemplate: DeferralCardTemplate;
    canvas: DeferralCardCanvas;
};

/**
 * Canonical deferral config for dirty-state comparison (matches post-save shape without studio flush).
 */
export function canonicalDeferralCardsForDiff(config: unknown): DeferralCardsConfig {
    try {
        return prepareDeferralCardsForSave(
            applySharedPlaceholdersToDeferralConfig(normalizeDeferralCardsConfig(config)),
        );
    } catch {
        return applySharedPlaceholdersToDeferralConfig(normalizeDeferralCardsConfig(config));
    }
}

/**
 * Normalizes all scenarios for persistence (flushes active studio canvas, syncs layout fields).
 */
export type PrepareDeferralCardsForSaveOptions = {
    /** When set, only these scenarios are normalized for persistence (single-card save). */
    syncScenarioIds?: (DeferralScenarioId | string)[];
};

export function prepareDeferralCardsForSave(
    config: DeferralCardsConfig,
    active?: PrepareDeferralCardsActiveStudio,
    options?: PrepareDeferralCardsForSaveOptions,
): DeferralCardsConfig {
    let cfg = normalizeDeferralCardsConfig(config);
    if (active) {
        const merged = templateWithCanvas(
            sanitizeDeferralCardTemplate(active.baseTemplate),
            normalizeCanvasRecord({
                width: active.canvas.width,
                height: active.canvas.height,
                minHeight: active.canvas.minHeight,
                elements: finalizeCanvasElementsForSave(coerceCanvasElements(active.canvas.elements)),
            }),
        );
        cfg = patchDeferralScenario(cfg, active.scenarioId, merged);
    }
    const scenarios = { ...cfg.scenarios };
    const addonScenarios = { ...(cfg.addonScenarios ?? {}) };
    const syncIds = options?.syncScenarioIds ?? DEFERRAL_SCENARIO_META.map(({ id }) => id);
    for (const id of syncIds) {
        if (isAddonDeferralScenarioId(id)) {
            const tpl = addonScenarios[id];
            if (tpl) addonScenarios[id] = syncLegacyFieldsFromLayout(sanitizeDeferralCardTemplate(tpl));
            continue;
        }
        const tpl = scenarios[id as DeferralScenarioId];
        if (tpl) {
            scenarios[id as DeferralScenarioId] = syncLegacyFieldsFromLayout(sanitizeDeferralCardTemplate(tpl));
        }
    }

    const out = normalizeDeferralCardsConfig({
        skin: cfg.skin,
        discordInvite: cfg.discordInvite,
        sharedCustomPlaceholders: cfg.sharedCustomPlaceholders,
        scenarios,
        addonScenarios,
    });
    const parsed = DeferralCardsConfigSchema.safeParse(out);
    if (!parsed.success) {
        const paths = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
        throw new Error(paths ? `Invalid deferral cards (${paths})` : 'Invalid deferral cards');
    }
    return parsed.data;
}
