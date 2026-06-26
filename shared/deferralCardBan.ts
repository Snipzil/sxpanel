/** Studio preview strings baked into saved canvas layouts — replaced at connect time when ban data exists. */
export const BAN_STUDIO_PREVIEW_SNIPPETS = {
    expiresDuration: '2 days',
    reasonExample: 'Example ban',
    banDateExample: 'Jun 2, 2026, 10:40:41 PM',
    banIdExample: 'A12345',
    expiresLine: '<strong>Your ban will expire in:</strong> 2 days <br>',
    reasonLine: '<strong>Ban Reason:</strong> Example ban <br>',
    dateLine: '<strong>Ban Date:</strong> Jun 2, 2026, 10:40:41 PM <br>',
    idLine: '<strong>Ban ID:</strong> <codeid>A12345</codeid> <br>',
} as const;

/** Canvas text that shows live ban reason (studio preview or resolved Ban Reason line). */
export function isBanReasonCanvasContent(raw: string | undefined): boolean {
    if (!raw) return false;
    if (raw.includes(BAN_STUDIO_PREVIEW_SNIPPETS.reasonExample)) return true;
    if (raw.includes(BAN_STUDIO_PREVIEW_SNIPPETS.reasonLine)) return true;
    return /<strong>\s*Ban Reason:\s*<\/strong>/i.test(raw);
}

/** Canvas text that shows live ban expiry (studio preview or resolved expiration line). */
export function isBanExpiresCanvasContent(raw: string | undefined): boolean {
    if (!raw) return false;
    if (raw.includes(BAN_STUDIO_PREVIEW_SNIPPETS.expiresDuration)) return true;
    if (raw.includes(BAN_STUDIO_PREVIEW_SNIPPETS.expiresLine)) return true;
    return /<strong>\s*Your ban will expire in:\s*<\/strong>/i.test(raw);
}

/**
 * Substitutes studio preview copy and applies ban tokens for canvas text elements.
 */
export function resolveDeferralElementContent(rawContent: string | undefined, tokens: DeferralBanTokenFields): string {
    let content = rawContent ?? '';
    if (!content) return content;

    if (tokens.banExpires) {
        content = content.replaceAll(BAN_STUDIO_PREVIEW_SNIPPETS.expiresDuration, tokens.banExpires);
        content = content.replaceAll(
            BAN_STUDIO_PREVIEW_SNIPPETS.expiresLine,
            `<strong>Your ban will expire in:</strong> ${tokens.banExpires} <br>`,
        );
    }
    if (tokens.banReason) {
        content = content.replaceAll(BAN_STUDIO_PREVIEW_SNIPPETS.reasonExample, tokens.banReason);
        content = content.replaceAll(
            BAN_STUDIO_PREVIEW_SNIPPETS.reasonLine,
            `<strong>Ban Reason:</strong> ${tokens.banReason} <br>`,
        );
    }
    if (tokens.banDate) {
        content = content.replaceAll(BAN_STUDIO_PREVIEW_SNIPPETS.banDateExample, tokens.banDate);
        content = content.replaceAll(
            BAN_STUDIO_PREVIEW_SNIPPETS.dateLine,
            `<strong>Ban Date:</strong> ${tokens.banDate} <br>`,
        );
    }
    if (tokens.banId) {
        content = content.replaceAll(BAN_STUDIO_PREVIEW_SNIPPETS.banIdExample, tokens.banId);
        content = content.replaceAll('R12345', tokens.banId);
        content = content.replaceAll(
            BAN_STUDIO_PREVIEW_SNIPPETS.idLine,
            `<strong>Ban ID:</strong> <codeid>${tokens.banId}</codeid> <br>`,
        );
    }

    return content;
}

export type DeferralBanTokenFields = {
    banReason?: string;
    banExpires?: string;
    banId?: string;
    banDate?: string;
    banAuthor?: string;
};
