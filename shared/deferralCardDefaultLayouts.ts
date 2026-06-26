import type { DeferralCardLayout } from './deferralCardLayout';
import { DEFERRAL_CARD_CANVAS_WIDTH, type DeferralCanvasElement } from './deferralCardCanvasSchema';
import { reflowStackedCanvasElements } from './deferralCardCanvasReflow';
import type { DeferralCardTemplate, DeferralScenarioId } from './deferralCardTypes';
import { BAN_STUDIO_PREVIEW_SNIPPETS } from './deferralCardBan';
import { DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX, DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX } from './deferralCardWatermark';

const W = DEFERRAL_CARD_CANVAS_WIDTH;

/** English locale strings mirrored from locale/en.json (txAdmin-compatible). */
const TXADMIN_LOCALE = {
    ban: {
        titleTemporary: 'You have been temporarily banned from this server.',
        titlePermanent: 'You have been permanently banned from this server.',
        labelExpiration: 'Your ban will expire in',
        labelDate: 'Ban Date',
        labelAuthor: 'Banned by',
        labelReason: 'Ban Reason',
        labelId: 'Ban ID',
    },
    whitelist: {
        adminOnly: {
            modeTitle: 'This server is in <strong>Admin-only</strong> mode.',
            insufficientIds:
                'You do not have <code>discord</code> or <code>fivem</code> identifiers, and at least one of them is required to validate if you are a fxPanel administrator.',
            denyMessage: 'Your identifiers are not assigned to any fxPanel administrator.',
        },
        guildMember: {
            modeTitle: 'This server is in <strong>Discord server Member Whitelist</strong> mode.',
            insufficientIds:
                'You do not have the <code>discord</code> identifier, which is required to validate if you have joined our Discord server. Please open the Discord Desktop app and try again (the Web app won\'t work).',
            denyTitle: 'You are required to join our Discord server to connect.',
            denyMessage: 'Please join {guildName} then try again.',
        },
        guildRoles: {
            modeTitle: 'This server is in <strong>Discord Role Whitelist</strong> mode.',
            insufficientIds:
                'You do not have the <code>discord</code> identifier, which is required to validate if you have joined our Discord server. Please open the Discord Desktop app and try again (the Web app won\'t work).',
            denyNotmemberTitle: 'You are required to join our Discord server to connect.',
            denyNotmemberMessage: 'Please join {guildName}, get one of the required roles, then try again.',
            denyNorolesTitle: 'You do not have a whitelisted role required to join.',
            denyNorolesMessage:
                'To join this server you are required to have at least one of the whitelisted roles on the guild {guildName}.',
        },
        approvedLicense: {
            modeTitle: 'This server is in <strong>License Whitelist</strong> mode.',
            insufficientIds:
                'You do not have the <code>license</code> identifier, which means the server has <code>sv_lan</code> enabled. If you are the server owner, you can disable it in the <code>server.cfg</code> file.',
            denyTitle: 'You are not whitelisted to join this server.',
            requestIdLabel: 'Request ID',
        },
    },
} as const;

function layout(width: number, height: number, elements: DeferralCanvasElement[]): DeferralCardLayout {
    return { version: 2, blocks: [], canvas: { width, height, elements } };
}

function el(id: string, partial: Omit<DeferralCanvasElement, 'id'> & { id?: string }): DeferralCanvasElement {
    return { id, ...partial };
}

type TxAdminClassicOpts = {
    prefix: string;
    title: string;
    bodyLines: string[];
    includeRejectionMessage?: boolean;
    height?: number;
};

/** txAdmin rejectMessageTemplate structure: h2 title + 1.25rem body lines + optional custom message. */
function txAdminClassicLayout(opts: TxAdminClassicOpts): DeferralCardLayout {
    const elements: DeferralCanvasElement[] = [];
    let y = 0;
    const headingGap = 40;
    const lineStep = 40;

    elements.push(
        el(`${opts.prefix}:title`, {
            type: 'heading',
            x: 0,
            y,
            width: W,
            content: opts.title,
            style: { fontSize: 22, fontWeight: 'bold' },
            enabled: true,
        }),
    );
    y += headingGap;

    for (let i = 0; i < opts.bodyLines.length; i++) {
        elements.push(
            el(`${opts.prefix}:line${i}`, {
                type: 'text',
                x: 0,
                y,
                width: W,
                content: opts.bodyLines[i],
                style: { fontSize: 20 },
                enabled: true,
            }),
        );
        y += lineStep;
    }

    if (opts.includeRejectionMessage) {
        elements.push(
            el(`${opts.prefix}:rej`, {
                type: 'rejection_message',
                x: 0,
                y,
                width: W,
                style: { fontSize: 20 },
                enabled: true,
            }),
        );
        y += lineStep;
    }

    elements.push(
        el(`${opts.prefix}:logo`, {
            type: 'logo',
            x: 0,
            y: 0,
            width: DEFERRAL_TXADMIN_WATERMARK_WIDTH_PX,
            height: DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX,
            enabled: true,
        }),
    );

    const height = opts.height ?? Math.max(220, y + DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX + 24);
    return layout(W, height, elements);
}

function banLayout(permanent: boolean): DeferralCardLayout {
    const prefix = permanent ? 'banP' : 'banT';
    const lines = permanent
        ? []
        : [`<strong>${TXADMIN_LOCALE.ban.labelExpiration}:</strong> ${BAN_STUDIO_PREVIEW_SNIPPETS.expiresDuration} <br>`];
    lines.push(
        BAN_STUDIO_PREVIEW_SNIPPETS.dateLine,
        BAN_STUDIO_PREVIEW_SNIPPETS.reasonLine,
        BAN_STUDIO_PREVIEW_SNIPPETS.idLine,
    );
    return txAdminClassicLayout({
        prefix,
        title: permanent ? TXADMIN_LOCALE.ban.titlePermanent : TXADMIN_LOCALE.ban.titleTemporary,
        bodyLines: lines,
        includeRejectionMessage: true,
        height: permanent ? 260 : 300,
    });
}

export const DEFERRAL_DEFAULT_CARD_LAYOUTS: Record<DeferralScenarioId, DeferralCardLayout> = {
    ban_temporary: banLayout(false),
    ban_permanent: banLayout(true),
    whitelist_pending: txAdminClassicLayout({
        prefix: 'wlPending',
        title: TXADMIN_LOCALE.whitelist.approvedLicense.denyTitle,
        bodyLines: [`<strong>${TXADMIN_LOCALE.whitelist.approvedLicense.requestIdLabel}:</strong> <codeid>{requestId}</codeid> <br>`],
        includeRejectionMessage: true,
        height: 220,
    }),
    whitelist_schedule_closed: txAdminClassicLayout({
        prefix: 'wlSched',
        title: TXADMIN_LOCALE.whitelist.approvedLicense.denyTitle,
        bodyLines: [],
        includeRejectionMessage: true,
        height: 200,
    }),
    whitelist_admin_denied: txAdminClassicLayout({
        prefix: 'wlAdm',
        title: TXADMIN_LOCALE.whitelist.adminOnly.modeTitle,
        bodyLines: [TXADMIN_LOCALE.whitelist.adminOnly.denyMessage],
        height: 220,
    }),
    whitelist_admin_insufficient_ids: txAdminClassicLayout({
        prefix: 'wlAdmIds',
        title: TXADMIN_LOCALE.whitelist.adminOnly.modeTitle,
        bodyLines: [TXADMIN_LOCALE.whitelist.adminOnly.insufficientIds],
        height: 260,
    }),
    whitelist_discord_member_denied: txAdminClassicLayout({
        prefix: 'wlDisc',
        title: TXADMIN_LOCALE.whitelist.guildMember.denyTitle,
        bodyLines: [],
        includeRejectionMessage: true,
        height: 200,
    }),
    whitelist_discord_member_insufficient_ids: txAdminClassicLayout({
        prefix: 'wlDiscIds',
        title: TXADMIN_LOCALE.whitelist.guildMember.modeTitle,
        bodyLines: [TXADMIN_LOCALE.whitelist.guildMember.insufficientIds],
        height: 280,
    }),
    whitelist_discord_roles_not_member: txAdminClassicLayout({
        prefix: 'wlRolesNm',
        title: TXADMIN_LOCALE.whitelist.guildRoles.denyNotmemberTitle,
        bodyLines: [],
        includeRejectionMessage: true,
        height: 200,
    }),
    whitelist_discord_roles_no_roles: txAdminClassicLayout({
        prefix: 'wlRolesNr',
        title: TXADMIN_LOCALE.whitelist.guildRoles.denyNorolesTitle,
        bodyLines: [],
        includeRejectionMessage: true,
        height: 200,
    }),
    whitelist_discord_roles_insufficient_ids: txAdminClassicLayout({
        prefix: 'wlRolesIds',
        title: TXADMIN_LOCALE.whitelist.guildRoles.modeTitle,
        bodyLines: [TXADMIN_LOCALE.whitelist.guildRoles.insufficientIds],
        height: 280,
    }),
    whitelist_insufficient_license: txAdminClassicLayout({
        prefix: 'wlLic',
        title: TXADMIN_LOCALE.whitelist.approvedLicense.modeTitle,
        bodyLines: [TXADMIN_LOCALE.whitelist.approvedLicense.insufficientIds],
        height: 280,
    }),
    whitelist_error: txAdminClassicLayout({
        prefix: 'wlErr',
        title: 'Error validating Discord Server Member Whitelist status:',
        bodyLines: ['<code>Example Discord API error</code>'],
        height: 220,
    }),
    connection_queue: txAdminClassicLayout({
        prefix: 'queue',
        title: 'Connection Queue',
        bodyLines: ['{customMessage}'],
        height: 200,
    }),
    access_denied: txAdminClassicLayout({
        prefix: 'deny',
        title: 'Access Denied',
        bodyLines: [],
        includeRejectionMessage: true,
        height: 200,
    }),
};

export function getDefaultDeferralCardLayout(scenarioId: DeferralScenarioId): DeferralCardLayout {
    const base = DEFERRAL_DEFAULT_CARD_LAYOUTS[scenarioId];
    const provisionalHeight = base.canvas?.height ?? 220;
    const stacked = reflowStackedCanvasElements(base.canvas?.elements ?? [], W, provisionalHeight);
    const contentBottom = stacked
        .filter((e) => e.type !== 'logo')
        .reduce((max, e) => Math.max(max, e.y + (e.height ?? 28)), 0);
    const height = Math.max(provisionalHeight, contentBottom + DEFERRAL_TXADMIN_WATERMARK_HEIGHT_PX + 24);
    return {
        ...base,
        canvas: {
            ...base.canvas!,
            width: W,
            height,
            elements: reflowStackedCanvasElements(stacked, W, height),
        },
    };
}

/** Shipped text-only fields used to detect untouched legacy bland defaults. */
export const LEGACY_BLAND_DEFERRAL_TEMPLATE: Record<
    DeferralScenarioId,
    Pick<DeferralCardTemplate, 'title' | 'bodyTemplate' | 'showRequestId' | 'showTierName'>
> = {
    ban_temporary: {
        title: 'Banned',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    ban_permanent: {
        title: 'Banned',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_pending: {
        title: 'Not Whitelisted',
        bodyTemplate: 'Please join {guildName} and request to be whitelisted.',
        showRequestId: true,
        showTierName: false,
    },
    whitelist_schedule_closed: {
        title: 'Applications Closed',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_admin_denied: {
        title: 'Server Maintenance',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_admin_insufficient_ids: {
        title: 'Server Maintenance',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_member_denied: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_member_insufficient_ids: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_not_member: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_no_roles: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_insufficient_ids: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_insufficient_license: {
        title: 'Not Whitelisted',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_error: {
        title: 'Whitelist Error',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    connection_queue: {
        title: 'Connection Queue',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    access_denied: {
        title: 'Access Denied',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
};

/** txAdmin-aligned template fields (title/body toggles) for shipped defaults. */
export const TXADMIN_DEFERRAL_TEMPLATE_FIELDS: Record<
    DeferralScenarioId,
    Pick<DeferralCardTemplate, 'title' | 'bodyTemplate' | 'showRequestId' | 'showTierName'>
> = {
    ban_temporary: {
        title: TXADMIN_LOCALE.ban.titleTemporary,
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    ban_permanent: {
        title: TXADMIN_LOCALE.ban.titlePermanent,
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_pending: {
        title: TXADMIN_LOCALE.whitelist.approvedLicense.denyTitle,
        bodyTemplate: `{customMessage}`,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_schedule_closed: {
        title: TXADMIN_LOCALE.whitelist.approvedLicense.denyTitle,
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    whitelist_admin_denied: {
        title: TXADMIN_LOCALE.whitelist.adminOnly.modeTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.adminOnly.denyMessage,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_admin_insufficient_ids: {
        title: TXADMIN_LOCALE.whitelist.adminOnly.modeTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.adminOnly.insufficientIds,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_member_denied: {
        title: TXADMIN_LOCALE.whitelist.guildMember.denyTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.guildMember.denyMessage,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_member_insufficient_ids: {
        title: TXADMIN_LOCALE.whitelist.guildMember.modeTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.guildMember.insufficientIds,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_not_member: {
        title: TXADMIN_LOCALE.whitelist.guildRoles.denyNotmemberTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.guildRoles.denyNotmemberMessage,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_no_roles: {
        title: TXADMIN_LOCALE.whitelist.guildRoles.denyNorolesTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.guildRoles.denyNorolesMessage,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_discord_roles_insufficient_ids: {
        title: TXADMIN_LOCALE.whitelist.guildRoles.modeTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.guildRoles.insufficientIds,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_insufficient_license: {
        title: TXADMIN_LOCALE.whitelist.approvedLicense.modeTitle,
        bodyTemplate: TXADMIN_LOCALE.whitelist.approvedLicense.insufficientIds,
        showRequestId: false,
        showTierName: false,
    },
    whitelist_error: {
        title: 'Error validating Discord Server Member Whitelist status:',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    connection_queue: {
        title: 'Connection Queue',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
    access_denied: {
        title: 'Access Denied',
        bodyTemplate: '{customMessage}',
        showRequestId: false,
        showTierName: false,
    },
};

/** Detects the previous badge-on-top styled default layouts (pre-txAdmin defaults). */
export function isPreviousStyledDeferralDefault(template: DeferralCardTemplate): boolean {
    const ids = template.layout?.canvas?.elements?.map((e) => e.id) ?? [];
    return ids.some((id) => /:badge$/.test(id) || /:status/.test(id) || /:f\d/.test(id));
}

function canvasElementIdsMatch(
    a: DeferralCanvasElement[] | undefined,
    b: DeferralCanvasElement[] | undefined,
): boolean {
    if (!a?.length || !b?.length || a.length !== b.length) return false;
    const left = [...a]
        .map((e) => e.id)
        .sort()
        .join('\0');
    const right = [...b]
        .map((e) => e.id)
        .sort()
        .join('\0');
    return left === right;
}

function matchesLegacyBlandFields(scenarioId: DeferralScenarioId, template: DeferralCardTemplate): boolean {
    const legacy = LEGACY_BLAND_DEFERRAL_TEMPLATE[scenarioId];
    if (!legacy) return false;
    if ((template.customPlaceholders ?? []).length > 0) return false;
    return (
        template.title === legacy.title &&
        (template.bodyTemplate?.trim?.() ?? '') === legacy.bodyTemplate &&
        template.showRequestId === legacy.showRequestId &&
        template.showTierName === legacy.showTierName
    );
}

function matchesTxAdminShippedFields(scenarioId: DeferralScenarioId, template: DeferralCardTemplate): boolean {
    const shipped = TXADMIN_DEFERRAL_TEMPLATE_FIELDS[scenarioId];
    if (!shipped) return false;
    if ((template.customPlaceholders ?? []).length > 0) return false;
    return (
        template.title === shipped.title &&
        (template.bodyTemplate?.trim?.() ?? '') === shipped.bodyTemplate &&
        template.showRequestId === shipped.showRequestId &&
        template.showTierName === shipped.showTierName
    );
}

/**
 * True when a stored template is still on a shipped default (bland, fancy, or prior txAdmin canvas)
 * and should be reset to the current txAdmin-style shipped preset.
 */
export function shouldResetToClassicDeferralTemplate(
    scenarioId: DeferralScenarioId,
    template: DeferralCardTemplate,
): boolean {
    const canvas = template.layout?.canvas;
    if (canvas?.elements?.length) {
        if (isPreviousStyledDeferralDefault(template)) return true;
        if (canvasElementIdsMatch(canvas.elements, DEFERRAL_DEFAULT_CARD_LAYOUTS[scenarioId]?.canvas?.elements)) {
            return false;
        }
        return false;
    }

    if (!template.layout?.blocks?.length) {
        return (
            matchesLegacyBlandFields(scenarioId, template) ||
            (matchesTxAdminShippedFields(scenarioId, template) && !template.layout?.canvas?.elements?.length)
        );
    }

    return matchesLegacyBlandFields(scenarioId, template);
}

/** @deprecated Use {@link shouldResetToClassicDeferralTemplate} — kept for tests. */
export function isLegacyBlandDeferralTemplate(scenarioId: DeferralScenarioId, template: DeferralCardTemplate): boolean {
    return matchesLegacyBlandFields(scenarioId, template);
}
