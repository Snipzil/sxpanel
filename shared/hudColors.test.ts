import { describe, expect, it } from 'vitest';
import { nearestHudColorIndex } from './hudColors';

describe('nearestHudColorIndex', () => {
    it('maps pure black to HUD_COLOUR_BLACK (2)', () => {
        expect(nearestHudColorIndex('#000000')).toBe(2);
        expect(nearestHudColorIndex('000000')).toBe(2);
    });

    it('maps staff red to HUD_COLOUR_RED (6)', () => {
        expect(nearestHudColorIndex('#EF4444')).toBe(6);
    });
});
