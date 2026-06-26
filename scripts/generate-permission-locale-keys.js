/**
 * PR-K locale generator — merges panel permission / log route / system log /
 * deferral studio / deferral defaults / player tag preset keys into locale/en.json.
 *
 * Run: npx tsx scripts/generate-permission-locale-keys.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registeredPermissions } from '../shared/permissions.ts';
import { discordLogRouteDefinitions } from '../shared/discordLogRoutes.ts';
import { systemLogActionDefinitions } from '../shared/systemLogTypes.ts';
import { AUTO_TAG_DEFINITIONS } from '../shared/socketioTypes.ts';

/** Mirrors shared/deferralCardLayout.ts DEFERRAL_BLOCK_META */
const DEFERRAL_BLOCK_META = {
    heading: { label: 'Title' },
    text: { label: 'Text line' },
    paragraph: { label: 'Paragraph' },
    rejection_message: { label: 'Rejection message' },
    custom_text: { label: 'Custom text' },
    request_id: { label: 'Request ID' },
    ban_id: { label: 'Ban ID' },
    ban_reason: { label: 'Ban reason' },
    ban_expires: { label: 'Ban expiry' },
    tier_name: { label: 'Tier name' },
    spacer: { label: 'Spacer' },
    divider: { label: 'Divider' },
    logo: { label: 'Watermark logo' },
    custom_image: { label: 'Custom image' },
    button: { label: 'Button (link)' },
};

/** Mirrors shared/deferralCardDefaultLayouts.ts LEGACY_BLAND_DEFERRAL_TEMPLATE (avoid circular TS imports). */
const LEGACY_BLAND_DEFERRAL_TEMPLATE = {
    ban_temporary: { title: 'Banned', bodyTemplate: '{customMessage}' },
    ban_permanent: { title: 'Banned', bodyTemplate: '{customMessage}' },
    whitelist_pending: {
        title: 'Not Whitelisted',
        bodyTemplate: 'Please join {guildName} and request to be whitelisted.',
    },
    whitelist_schedule_closed: { title: 'Applications Closed', bodyTemplate: '{customMessage}' },
    whitelist_admin_denied: { title: 'Server Maintenance', bodyTemplate: '{customMessage}' },
    whitelist_admin_insufficient_ids: { title: 'Server Maintenance', bodyTemplate: '{customMessage}' },
    whitelist_discord_member_denied: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_discord_member_insufficient_ids: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_discord_roles_not_member: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_discord_roles_no_roles: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_discord_roles_insufficient_ids: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_insufficient_license: { title: 'Not Whitelisted', bodyTemplate: '{customMessage}' },
    whitelist_error: { title: 'Whitelist Error', bodyTemplate: '{customMessage}' },
    connection_queue: { title: 'Connection Queue', bodyTemplate: '{customMessage}' },
    access_denied: { title: 'Access Denied', bodyTemplate: '{customMessage}' },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const enPath = path.join(rootDir, 'locale', 'en.json');

const toKey = (id) => id.replace(/\./g, '_');

const deferralDefaultScenarios = {
    ban_temporary: {
        title: 'Banned',
        status: 'Temporary',
        section_title: 'Additional',
    },
    ban_permanent: {
        title: 'Banned',
        status: 'Permanent',
        section_title: 'Additional',
    },
    whitelist_pending: {
        title: 'Not Whitelisted',
        subtitle: 'Approval required before you can join',
        status: 'Pending',
        section_title: 'Next steps',
        message:
            'Join <strong>{guildName}</strong> and submit a whitelist request. Staff may ask for your request ID below.',
    },
    whitelist_schedule_closed: {
        title: 'Applications Closed',
        status: 'Closed',
        section_title: 'Details',
    },
    whitelist_admin_denied: {
        title: 'Server Maintenance',
        status: 'Maintenance',
        section_title: 'Details',
    },
    whitelist_admin_insufficient_ids: {
        title: 'Server Maintenance',
        status: 'Missing ID',
        required: 'License or Discord',
        section_title: 'Details',
    },
    whitelist_discord_member_denied: {
        title: 'Not Whitelisted',
        status: 'Not in guild',
        section_title: 'Details',
    },
    whitelist_discord_member_insufficient_ids: {
        title: 'Not Whitelisted',
        status: 'Missing ID',
        section_title: 'Details',
    },
    whitelist_discord_roles_not_member: {
        title: 'Not Whitelisted',
        status: 'Not in guild',
        section_title: 'Details',
    },
    whitelist_discord_roles_no_roles: {
        title: 'Not Whitelisted',
        status: 'Missing role',
        section_title: 'Details',
    },
    whitelist_discord_roles_insufficient_ids: {
        title: 'Not Whitelisted',
        status: 'Missing ID',
        required: 'discord:',
        section_title: 'Details',
    },
    whitelist_insufficient_license: {
        title: 'Not Whitelisted',
        status: 'Missing license',
        required: 'license:',
        section_title: 'Details',
    },
    whitelist_error: {
        title: 'Whitelist Error',
        status: 'Error',
        section_title: 'Details',
    },
    connection_queue: {
        title: '{serverName}',
        subtitle: 'Welcome, <strong>{playerName}</strong>',
        status: 'IN QUEUE',
        section_title: 'Boarding pass',
    },
    access_denied: {
        title: 'Access Denied',
        status: 'Denied',
        section_title: 'Details',
    },
};

const buildPrKPayload = () => {
    const permissions = {};
    for (const perm of registeredPermissions) {
        const k = toKey(perm.id);
        permissions[k] = { label: perm.label, description: perm.description };
    }

    const log_routes = {};
    for (const route of discordLogRouteDefinitions) {
        const k = toKey(route.key);
        log_routes[k] = { label: route.label, description: route.description };
    }

    const system_log = {};
    for (const entry of systemLogActionDefinitions) {
        const k = toKey(entry.id);
        system_log[k] = { label: entry.label };
    }

    const studio = {};
    for (const [type, meta] of Object.entries(DEFERRAL_BLOCK_META)) {
        studio[`block_${type}`] = { label: meta.label };
    }

    const presets = {};
    for (const tag of AUTO_TAG_DEFINITIONS) {
        presets[tag.id] = { label: tag.label };
    }

    const scenarios = {};
    for (const [scenarioId, legacy] of Object.entries(LEGACY_BLAND_DEFERRAL_TEMPLATE)) {
        const extra = deferralDefaultScenarios[scenarioId] ?? {};
        scenarios[scenarioId] = {
            title: extra.title ?? legacy.title,
            body: legacy.bodyTemplate,
            ...(extra.subtitle ? { subtitle: extra.subtitle } : {}),
            ...(extra.status ? { status: extra.status } : {}),
            ...(extra.section_title ? { section_title: extra.section_title } : {}),
            ...(extra.message ? { message: extra.message } : {}),
            ...(extra.required ? { required: extra.required } : {}),
        };
    }

    return {
        panel: {
            permissions,
            log_routes,
            system_log,
            deferral: { studio },
            player_tags: { presets },
        },
        deferral: {
            defaults: {
                labels: {
                    status: 'Status',
                    players: 'Players',
                    position: 'Position',
                    eta: 'ETA',
                    server: 'Server',
                    required: 'Required',
                    discord: 'Discord',
                    ban_id: 'Ban ID',
                    ban_date: 'Ban date',
                    additional: 'Additional',
                    details: 'Details',
                    next_steps: 'Next steps',
                    boarding_pass: 'Boarding pass',
                },
                scenarios,
            },
        },
    };
};

const deepMerge = (target, source) => {
    for (const [key, value] of Object.entries(source)) {
        if (
            value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            target[key] &&
            typeof target[key] === 'object' &&
            !Array.isArray(target[key])
        ) {
            deepMerge(target[key], value);
        } else {
            target[key] = value;
        }
    }
    return target;
};

const countLeaves = (obj, prefix = '') => {
    let n = 0;
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            !('label' in v) &&
            !('description' in v) &&
            !('body' in v)
        ) {
            n += countLeaves(v, p);
        } else if (typeof v === 'string') {
            n += 1;
        } else if (v && typeof v === 'object') {
            for (const sub of Object.values(v)) {
                if (typeof sub === 'string') n += 1;
            }
        }
    }
    return n;
};

const main = () => {
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
    const payload = buildPrKPayload();

    if (!en.panel) en.panel = {};
    if (!en.panel.permissions) en.panel.permissions = {};
    deepMerge(en.panel.permissions, payload.panel.permissions);
    en.panel.log_routes = { ...en.panel.log_routes, ...payload.panel.log_routes };
    en.panel.system_log = { ...en.panel.system_log, ...payload.panel.system_log };
    if (!en.panel.deferral) en.panel.deferral = {};
    deepMerge(en.panel.deferral, payload.panel.deferral);
    if (!en.panel.player_tags) en.panel.player_tags = {};
    deepMerge(en.panel.player_tags, payload.panel.player_tags);

    if (!en.deferral) en.deferral = {};
    deepMerge(en.deferral, payload.deferral);

    fs.writeFileSync(enPath, JSON.stringify(en, null, 4) + '\n');

    const stats = {
        permissions: Object.keys(payload.panel.permissions).length,
        log_routes: Object.keys(payload.panel.log_routes).length,
        system_log: Object.keys(payload.panel.system_log).length,
        deferral_studio_blocks: Object.keys(payload.panel.deferral.studio).length,
        player_tag_presets: Object.keys(payload.panel.player_tags.presets).length,
        deferral_default_scenarios: Object.keys(payload.deferral.defaults.scenarios).length,
        deferral_default_labels: Object.keys(payload.deferral.defaults.labels).length,
    };

    console.log('Merged PR-K locale keys into locale/en.json');
    console.log(JSON.stringify(stats, null, 2));
};

main();
