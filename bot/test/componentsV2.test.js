const { MessageFlags } = require('discord.js');
const {
    buildCardMessage,
    normalizeInteractionUpdatePayload,
    normalizeMessageEditPayload,
    normalizeMessagePayload,
} = require('../componentsV2');

const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;

const stripUndefined = (value) => JSON.parse(JSON.stringify(value));

describe('componentsV2 normalizeMessagePayload', () => {
    test('converts embeds to Components V2 containers and drops content/embeds', () => {
        const payload = normalizeMessagePayload({
            content: 'hello',
            embeds: [{ title: 'A title', description: 'A body' }],
        });

        expect(payload.content).toBeUndefined();
        expect(payload.embeds).toBeUndefined();
        expect(payload.flags & COMPONENTS_V2_FLAG).toBe(COMPONENTS_V2_FLAG);
        expect(Array.isArray(payload.components)).toBe(true);
        expect(payload.components.length).toBeGreaterThan(0);
    });

    test('passes through non-embed payloads untouched', () => {
        const input = { content: 'plain message', components: [{ type: 1 }] };
        const payload = normalizeMessagePayload(input);

        expect(payload.content).toBe('plain message');
        expect(payload.components).toEqual([{ type: 1 }]);
    });

    test('or-accumulates an existing flags value with IsComponentsV2', () => {
        const input = { embeds: [{ description: 'x' }], flags: 4 };
        const payload = normalizeMessagePayload(input);

        expect(payload.flags & COMPONENTS_V2_FLAG).toBe(COMPONENTS_V2_FLAG);
        expect(payload.flags & 4).toBe(4);
    });

    test('produces serializable container JSON', () => {
        const payload = normalizeMessagePayload({ embeds: [{ title: 't', description: 'd' }] });
        expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
    });

    test('appends action rows to the last container', () => {
        const actionRow = { type: 1, components: [{ type: 2, custom_id: 'a', label: 'A' }] };
        const payload = normalizeMessagePayload({
            embeds: [{ description: 'd' }],
            components: [actionRow],
        });

        const lastContainer = payload.components.at(-1);
        expect(Array.isArray(lastContainer.components)).toBe(true);
        const appended = lastContainer.components.find((component) => component.type === 1);
        expect(appended).toEqual(actionRow);
    });
});

describe('componentsV2 buildCardMessage', () => {
    test('builds a single container with the Components V2 flag', () => {
        const payload = buildCardMessage({ title: 'Title', body: 'Body', footer: 'foot' });

        expect(payload.flags & COMPONENTS_V2_FLAG).toBe(COMPONENTS_V2_FLAG);
        expect(payload.components).toHaveLength(1);
        expect(payload.components[0].type).toBe(17);
    });

    test('falls back to a placeholder when there is no content', () => {
        const payload = buildCardMessage({});
        const container = stripUndefined(payload).components[0];
        const textDisplays = container.components.filter((c) => c.type === 10);
        expect(textDisplays.some((c) => /No content/i.test(c.content))).toBe(true);
    });

    test('omits files/allowedMentions when not provided', () => {
        const payload = buildCardMessage({ title: 'T', body: 'B' });
        expect(payload.files).toBeUndefined();
        expect(payload.allowedMentions).toBeUndefined();
    });
});

describe('componentsV2 normalizeMessageEditPayload', () => {
    test('nulls content/embeds on edit while keeping components', () => {
        const payload = normalizeMessageEditPayload({
            content: 'old',
            embeds: [{ description: 'old' }],
            components: [{ type: 1 }],
        });

        expect(payload.content).toBeNull();
        expect(payload.embeds).toEqual([]);
        expect(Array.isArray(payload.components)).toBe(true);
        expect(payload.flags & COMPONENTS_V2_FLAG).toBe(COMPONENTS_V2_FLAG);
    });
});

describe('componentsV2 normalizeInteractionUpdatePayload', () => {
    test('keeps only the Components V2 flag from a combined flags value', () => {
        const payload = normalizeInteractionUpdatePayload({
            embeds: [{ description: 'd' }],
            flags: COMPONENTS_V2_FLAG | 64,
        });

        expect(payload.flags).toBe(COMPONENTS_V2_FLAG);
        expect(payload.flags & 64).toBe(0);
    });

    test('retains the V2 flag even when no flags were supplied', () => {
        const payload = normalizeInteractionUpdatePayload({ embeds: [{ description: 'd' }] });

        expect(payload.flags).toBe(COMPONENTS_V2_FLAG);
    });
});
