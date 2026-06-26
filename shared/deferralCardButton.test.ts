import { describe, it, expect } from 'vitest';
import {
    parseDeferralButtonContent,
    renderDeferralButtonAnchorHtml,
    sanitizeDeferralButtonUrl,
    serializeDeferralButtonContent,
} from './deferralCardButton';

describe('deferralCardButton', () => {
    it('serializes and parses button content', () => {
        const raw = serializeDeferralButtonContent({
            label: 'Appeal',
            url: '{discordInvite}',
            backgroundColor: '#ff0000',
            textColor: '#111111',
        });
        expect(parseDeferralButtonContent(raw)).toEqual({
            label: 'Appeal',
            url: '{discordInvite}',
            backgroundColor: '#ff0000',
            textColor: '#111111',
        });
    });

    it('sanitizes http(s) URLs only', () => {
        expect(sanitizeDeferralButtonUrl('https://discord.gg/test')).toBe('https://discord.gg/test');
        expect(sanitizeDeferralButtonUrl('javascript:alert(1)')).toBe('');
        expect(sanitizeDeferralButtonUrl('discord.gg/test')).toBe('https://discord.gg/test');
    });

    it('renders a styled anchor with custom colors', () => {
        const html = renderDeferralButtonAnchorHtml('Join', 'https://example.com', {
            backgroundColor: '#22c55e',
            textColor: '#000000',
        });
        expect(html).toContain('<a href="https://example.com/"');
        expect(html).toContain('background:#22c55e');
        expect(html).toContain('color:#000000');
        expect(html).toContain('Join');
        expect(html).not.toContain('<script');
    });
});
