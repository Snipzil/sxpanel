import type { InitializedCtx } from '@modules/WebServer/ctxTypes';
import { getDeferralScenarioTemplate } from '@modules/Whitelist/deferralCard';
import { getTemplateCanvas } from '@shared/deferralCardCanvas';
import { DeferralScenarioIdSchema } from '@shared/deferralCardTypes';
import {
    dataUriToSvgText,
    gifDataUriToBuffer,
    isDeferralGifDataUri,
    isDeferralPngDataUri,
    pngDataUriToBuffer,
} from '@shared/deferralCardSvg';

/**
 * Serves custom deferral images over HTTP (FiveM blocks data: URIs on img tags).
 */
export default async function deferralCardAsset(ctx: InitializedCtx) {
    const scenarioId = ctx.params.scenarioId;
    const elementId = (ctx.params.elementId as string)?.replace(/\.(png|svg|gif)$/i, '');
    if (!DeferralScenarioIdSchema.safeParse(scenarioId).success || !elementId) {
        ctx.status = 404;
        return;
    }

    const template = getDeferralScenarioTemplate(scenarioId);
    const canvas = getTemplateCanvas(template);
    const element = canvas.elements.find((el) => el.id === elementId && el.type === 'custom_image');
    if (!element?.content?.trim()) {
        ctx.status = 404;
        return;
    }

    const stored = element.content.trim();
    if (isDeferralPngDataUri(stored)) {
        const png = pngDataUriToBuffer(stored);
        if (!png?.length) {
            ctx.status = 404;
            return;
        }
        ctx.type = 'image/png';
        ctx.set('Cache-Control', 'public, max-age=300');
        ctx.body = png;
        return;
    }

    if (isDeferralGifDataUri(stored)) {
        const gif = gifDataUriToBuffer(stored);
        if (!gif?.length) {
            ctx.status = 404;
            return;
        }
        ctx.type = 'image/gif';
        ctx.set('Cache-Control', 'public, max-age=300');
        ctx.body = gif;
        return;
    }

    const svg = dataUriToSvgText(stored);
    if (!svg) {
        ctx.status = 404;
        return;
    }

    ctx.type = 'image/svg+xml';
    ctx.set('Cache-Control', 'public, max-age=300');
    ctx.body = svg;
}
