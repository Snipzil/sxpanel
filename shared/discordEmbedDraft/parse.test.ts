import { expect, it, suite } from 'vitest';
import { parseEmbedConfigJson, parseEmbedJson } from './parse';
import { STATUS_EMBED_CONFIG_PRESET, STATUS_EMBED_JSON_PRESET } from './presets';
import { serializeEmbedConfigJson, serializeEmbedJson } from './serialize';

suite('discordEmbedDraft parse/serialize', () => {
    it('round-trips status preset embed JSON', () => {
        const draft = parseEmbedJson(STATUS_EMBED_JSON_PRESET);
        expect(draft.title).toBe('{{serverName}}');
        expect(draft.fields.length).toBe(5);
        const serialized = serializeEmbedJson(draft);
        const reparsed = parseEmbedJson(serialized);
        expect(reparsed.title).toBe(draft.title);
        expect(reparsed.fields.length).toBe(draft.fields.length);
    });

    it('round-trips status preset config JSON', () => {
        const draft = parseEmbedConfigJson(STATUS_EMBED_CONFIG_PRESET);
        expect(draft.onlineColor).toBe('#0BA70B');
        expect(draft.buttons.length).toBe(2);
        const serialized = serializeEmbedConfigJson(draft);
        const reparsed = parseEmbedConfigJson(serialized);
        expect(reparsed.buttons[0]?.url).toBe(draft.buttons[0]?.url);
    });

    it('preserves unknown top-level embed keys in extra', () => {
        const raw = JSON.stringify({
            title: 'Test',
            customFlag: true,
            nested: { a: 1 },
        });
        const draft = parseEmbedJson(raw);
        expect(draft.title).toBe('Test');
        expect(draft.extra.customFlag).toBe(true);
        const serialized = JSON.parse(serializeEmbedJson(draft));
        expect(serialized.customFlag).toBe(true);
        expect(serialized.nested).toEqual({ a: 1 });
    });
});
