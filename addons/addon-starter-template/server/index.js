/**
 * fxPanel Addon — Starter Template
 *
 * This is a minimal server entry point demonstrating the core SDK features:
 * - Route registration (authenticated & public)
 * - Storage (key-value persistence)
 * - Event listeners (game events)
 * - WebSocket push (real-time panel updates)
 * - Logging
 *
 * Customize or remove sections as needed for your addon.
 */

import { createAddon } from 'addon-sdk';

const addon = createAddon();

const buildGreetingResponse = async (name) => {
    const visits = (await addon.storage.getOr('visits', 0)) + 1;
    await addon.storage.set('visits', visits);

    return {
        status: 200,
        body: {
            message: `Hello, ${name}! This addon has been queried ${visits} time(s).`,
        },
    };
};

// ────────────────────────────────────────
// Routes (authenticated — admin panel)
// ────────────────────────────────────────

// GET /addons/addon-starter-template/api/greeting
// This route is also used by the `starter-greeting` Discord slash command example.
// The command calls it through `bridge.request('addonRoute', ...)`, which lets the
// addon keep its real logic on the server side instead of duplicating it in Discord code.
addon.registerRoute('GET', '/greeting', async (req) => {
    return await buildGreetingResponse(req.admin.name);
});

addon.registerRoute('POST', '/greeting', async (req) => {
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 32) : '';
    const name = requestedName || req.admin.name;

    return await buildGreetingResponse(name);
});

// POST /addons/addon-starter-template/api/notes
addon.registerRoute('POST', '/notes', async (req) => {
    // Always check permissions in route handlers
    if (!req.admin.hasPermission('players.write')) {
        return { status: 403, body: { error: 'Requires players.write permission' } };
    }

    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
        return { status: 400, body: { error: 'text field is required' } };
    }

    // Read existing notes, append new one
    const notes = await addon.storage.getOr('notes', []);
    notes.push({
        text: text.trim().slice(0, 500),
        author: req.admin.name,
        createdAt: new Date().toISOString(),
    });
    await addon.storage.set('notes', notes);

    // Push real-time update to subscribed panel clients
    addon.ws.push('notes:updated', { count: notes.length });

    return { status: 200, body: { success: true, count: notes.length } };
});

// GET /addons/addon-starter-template/api/notes
addon.registerRoute('GET', '/notes', async (req) => {
    const notes = await addon.storage.getOr('notes', []);
    return { status: 200, body: { notes } };
});

// ────────────────────────────────────────
// Event Listeners (game events from core)
// ────────────────────────────────────────

addon.on('playerJoining', (data) => {
    addon.log.info(`Player joining: ${data.displayName} (netid: ${data.netid})`);

    // Example: push a real-time event to the panel
    addon.ws.push('player:joined', {
        name: data.displayName,
        time: new Date().toISOString(),
    });
});

addon.on('playerDropped', (data) => {
    addon.log.info(`Player dropped: netid ${data.netid}, reason: ${data.reason}`);
});

// ────────────────────────────────────────
// Startup
// ────────────────────────────────────────

// addon.ready() MUST be called after registering all routes.
// The core waits up to 10 seconds for this signal.
addon.log.info('Starter template addon loaded');
addon.ready();
