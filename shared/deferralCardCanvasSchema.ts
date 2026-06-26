import { z } from 'zod';

export const DEFERRAL_CARD_CANVAS_WIDTH = 640;
export const DEFERRAL_CARD_CANVAS_HEIGHT = 220;
export const DEFERRAL_CARD_PADDING = 20;
export const DEFERRAL_CARD_MARGIN_TOP = 25;
export const DEFERRAL_CANVAS_SNAP_GRID = 8;

export const DEFERRAL_CARD_WIDTH_MIN = 320;
export const DEFERRAL_CARD_WIDTH_MAX = 720;
export const DEFERRAL_CARD_HEIGHT_MIN = 120;
export const DEFERRAL_CARD_HEIGHT_MAX = 480;

export const DEFERRAL_CARD_SIZE_PRESETS = {
    wide: {
        label: 'Wide (640×220)',
        width: DEFERRAL_CARD_CANVAS_WIDTH,
        height: DEFERRAL_CARD_CANVAS_HEIGHT,
    },
    compact: { label: 'Compact (400×160)', width: 400, height: 160 },
    tall: { label: 'Tall (520×320)', width: 520, height: 320 },
} as const;

export type DeferralCardSizePresetId = keyof typeof DEFERRAL_CARD_SIZE_PRESETS;

export const DEFERRAL_CARD_CONTAINER_STYLE = [
    'background-color: rgba(14, 14, 18, 0.78)',
    `padding: ${DEFERRAL_CARD_PADDING}px`,
    'border: 1px solid rgba(255, 255, 255, 0.12)',
    'border-radius: 12px',
    'box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45)',
    `margin-top: ${DEFERRAL_CARD_MARGIN_TOP}px`,
    'position: relative',
    'color: #f4f4f5',
    'box-sizing: border-box',
    'overflow: hidden',
].join('; ');

export const DeferralCanvasElementSchema = z.object({
    id: z.string().min(1),
    type: z.enum([
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
    ] as const),
    x: z.number().default(0),
    y: z.number().default(0),
    width: z.number().optional(),
    height: z.number().optional(),
    content: z.string().optional(),
    enabled: z.boolean().default(true),
    style: z
        .object({
            fontSize: z.number().optional(),
            color: z.string().optional(),
            textAlign: z.enum(['left', 'center', 'right']).optional(),
            fontWeight: z.enum(['normal', 'bold']).optional(),
        })
        .optional(),
});
export type DeferralCanvasElement = z.infer<typeof DeferralCanvasElementSchema>;

export const DeferralCardCanvasSchema = z.object({
    width: z.number().default(DEFERRAL_CARD_CANVAS_WIDTH),
    /** Fixed card height (elements clip inside). */
    height: z.number().default(DEFERRAL_CARD_CANVAS_HEIGHT),
    /** @deprecated Migrated to `height`. */
    minHeight: z.number().optional(),
    elements: z.array(DeferralCanvasElementSchema).default([]),
});
export type DeferralCardCanvas = z.infer<typeof DeferralCardCanvasSchema>;
