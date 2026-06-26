import type { DeferralCanvasElement } from './deferralCardCanvas';
import { getTemplateCanvas, resolveTextLineContent, splitCustomMessageParts } from './deferralCardCanvas';
import { resolveDeferralElementContent } from './deferralCardBan';
import type { DeferralCustomPlaceholder } from './deferralCardLayout';
import type { DeferralCardTemplate } from './deferralCardTypes';
import type { DeferralBanTokenFields } from './deferralCardBan';

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

type ApplyTokens = (template: string, tokens: DeferralCardTokens, custom: DeferralCustomPlaceholder[]) => string;

type AdaptiveNode = Record<string, unknown>;

function deferralSupplementalMessageEmpty(html: string): boolean {
    const stripped = html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .trim();
    return !stripped;
}

function resolveDeferralIdDisplay(tokens: DeferralCardTokens): { label: 'Request ID' | 'Ban ID'; id: string } | null {
    if (tokens.requestId) return { label: 'Request ID', id: tokens.requestId };
    if (tokens.banId) return { label: 'Ban ID', id: tokens.banId };
    return null;
}

const TEXT_LIKE = new Set<DeferralCanvasElement['type']>([
    'heading',
    'text',
    'paragraph',
    'custom_text',
    'rejection_message',
    'request_id',
    'ban_id',
    'ban_reason',
    'ban_expires',
    'tier_name',
]);

function htmlToAdaptiveText(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function textBlock(
    text: string,
    opts: { size?: string; weight?: string; isSubtle?: boolean; spacing?: string; color?: string } = {},
): AdaptiveNode {
    const node: AdaptiveNode = { type: 'TextBlock', text, wrap: true };
    if (opts.size) node.size = opts.size;
    if (opts.weight) node.weight = opts.weight;
    if (opts.isSubtle) node.isSubtle = true;
    if (opts.spacing) node.spacing = opts.spacing;
    if (opts.color) node.color = opts.color;
    return node;
}

function resolveElementAdaptiveText(
    el: DeferralCanvasElement,
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    applyTokens: ApplyTokens,
    textLineIndex: number,
    messageParts: string[],
): string | null {
    const preprocess = (raw: string) => resolveDeferralElementContent(raw, tokens);

    switch (el.type) {
        case 'heading': {
            const raw = preprocess(
                el.content?.trim() || template.title || tokens.title || tokens.serverName || 'Queue',
            );
            return htmlToAdaptiveText(applyTokens(raw, tokens, template.customPlaceholders));
        }
        case 'text': {
            const html = resolveTextLineContent(el, tokens, template, textLineIndex, messageParts, (text) =>
                applyTokens(preprocess(text), tokens, template.customPlaceholders),
            );
            return htmlToAdaptiveText(html);
        }
        case 'custom_text':
        case 'paragraph': {
            const raw =
                el.type === 'paragraph'
                    ? el.content?.trim()
                        ? el.content
                        : template.bodyTemplate || '{customMessage}'
                    : preprocess(el.content?.trim() ?? '');
            const html = applyTokens(raw, tokens, template.customPlaceholders);
            if (raw.includes('{customMessage}') && deferralSupplementalMessageEmpty(html)) return null;
            return htmlToAdaptiveText(html);
        }
        case 'rejection_message': {
            const html = applyTokens(preprocess(tokens.customMessage ?? ''), tokens, template.customPlaceholders);
            return htmlToAdaptiveText(html);
        }
        case 'request_id':
        case 'ban_id': {
            const display = resolveDeferralIdDisplay(tokens);
            if (!display) return null;
            return `${display.label}: ${display.id}`;
        }
        case 'ban_reason':
            return tokens.banReason ? `Reason: ${tokens.banReason}` : null;
        case 'ban_expires':
            return tokens.banExpires ? `Expires: ${tokens.banExpires}` : null;
        case 'tier_name':
            return template.showTierName && tokens.tierName ? `Tier: ${tokens.tierName}` : null;
        default:
            return null;
    }
}

function columnSetForRow(
    row: DeferralCanvasElement[],
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    applyTokens: ApplyTokens,
    textElements: DeferralCanvasElement[],
    messageParts: string[],
): AdaptiveNode | null {
    const columns = [...row]
        .sort((a, b) => a.x - b.x)
        .map((el) => {
            const isTextLine = el.type === 'text' || el.type === 'paragraph';
            const textLineIndex = isTextLine ? textElements.findIndex((t) => t.id === el.id) : -1;
            const text = resolveElementAdaptiveText(
                el,
                template,
                tokens,
                applyTokens,
                isTextLine ? textLineIndex : 0,
                messageParts,
            );
            if (!text) return null;
            const isLabel = (el.content ?? '').includes('letter-spacing:0.12em') || el.style?.fontSize === 11;
            return {
                type: 'Column',
                width: 'stretch',
                items: [
                    textBlock(text, {
                        size: isLabel ? 'Small' : 'Default',
                        weight: isLabel ? 'Default' : 'Bolder',
                        isSubtle: isLabel,
                        spacing: 'None',
                    }),
                ],
            };
        })
        .filter(Boolean);
    if (!columns.length) return null;
    return { type: 'ColumnSet', columns, spacing: 'Small' };
}

/**
 * FiveM `deferrals.update()` does not render HTML (only `done()` does).
 * Queue status must use Adaptive Cards via `deferrals.presentCard()`.
 */
export function buildConnectionQueueAdaptiveCard(
    template: DeferralCardTemplate,
    tokens: DeferralCardTokens,
    applyTokens: ApplyTokens,
): string {
    const canvas = getTemplateCanvas(template);
    const messageParts = splitCustomMessageParts(tokens.customMessage ?? '');
    const textElements = canvas.elements.filter(
        (e) => (e.type === 'text' || e.type === 'paragraph') && e.enabled !== false,
    );
    const enabled = canvas.elements.filter((e) => e.enabled !== false && e.type !== 'logo' && e.type !== 'spacer');
    const body: AdaptiveNode[] = [];
    const used = new Set<string>();

    for (let i = 0; i < enabled.length; i++) {
        const el = enabled[i]!;
        if (used.has(el.id)) continue;

        if (el.type === 'divider') {
            body.push(textBlock(' ', { spacing: 'Small' }));
            used.add(el.id);
            continue;
        }

        if (TEXT_LIKE.has(el.type)) {
            const rowPeers = enabled.filter(
                (peer) => peer.y === el.y && TEXT_LIKE.has(peer.type) && peer.type !== 'heading',
            );
            if (rowPeers.length > 1) {
                const columnSet = columnSetForRow(rowPeers, template, tokens, applyTokens, textElements, messageParts);
                if (columnSet) body.push(columnSet);
                rowPeers.forEach((p) => used.add(p.id));
                continue;
            }
        }

        const isTextLine = el.type === 'text' || el.type === 'paragraph';
        const textLineIndex = isTextLine ? textElements.findIndex((t) => t.id === el.id) : -1;
        const text = resolveElementAdaptiveText(
            el,
            template,
            tokens,
            applyTokens,
            isTextLine ? textLineIndex : 0,
            messageParts,
        );
        used.add(el.id);
        if (!text) continue;

        if (el.type === 'heading') {
            body.push(textBlock(text, { size: 'Large', weight: 'Bolder', spacing: 'Medium' }));
        } else if (text === 'IN QUEUE') {
            body.push(textBlock(text, { weight: 'Bolder', color: 'good', spacing: 'Small' }));
        } else {
            body.push(textBlock(text, { spacing: 'Small' }));
        }
    }

    const card = {
        type: 'AdaptiveCard',
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        version: '1.0',
        body,
    };
    return JSON.stringify(card);
}
