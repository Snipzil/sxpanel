/**
 * Starter template — server entry (`addon.json` → `server.entry`)
 *
 * Example app: a tiny staff "shift board" (pins, who's on shift, live traffic).
 * Panel + Discord hit the same routes under /addons/addon-starter-template/api/*
 *
 * Docs: https://fxpanel.org/docs/
 */

import { createAddon } from 'addon-sdk';

const addon = createAddon();
const canWsPush = () => addon.permissions.includes('ws.push');

const PIN_KINDS = new Set(['alert', 'memo', 'win']);
const MAX_ACTIVITY = 24;
const PULSE_WINDOW_MS = 60 * 60 * 1000;
const PERM_VIEW_DUTY_HOURS = 'addon-starter-template.view-duty-hours';

const normalizeAdminName = (name) =>
    String(name || '')
        .trim()
        .toLowerCase();

const parseSinceMs = (iso) => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
};

const msSince = (iso) => {
    const t = parseSinceMs(iso);
    if (t === null) return 0;
    return Math.max(0, Date.now() - t);
};

const formatDurationMs = (ms) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '0s';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

const findShiftEntry = (onShift, adminName) => {
    const key = normalizeAdminName(adminName);
    return onShift.find((row) => normalizeAdminName(row.name) === key);
};

const findShiftIndex = (onShift, adminName) => {
    const key = normalizeAdminName(adminName);
    return onShift.findIndex((row) => normalizeAdminName(row.name) === key);
};

/** Fix legacy onShift rows missing a valid `since` (would otherwise show 0m forever). */
const repairOnShiftRows = async () => {
    const onShift = await addon.storage.getOr('onShift', []);
    let dirty = false;

    for (const row of onShift) {
        if (parseSinceMs(row.since) === null) {
            row.since = new Date().toISOString();
            dirty = true;
        }
    }

    if (dirty) {
        await addon.storage.set('onShift', onShift);
    }

    return onShift;
};

const getDutyTotals = async () => addon.storage.getOr('dutyTotals', {});

const finalizeDutySession = async (name, sinceIso) => {
    const elapsed = msSince(sinceIso);
    if (!Number.isFinite(elapsed) || elapsed <= 0) return null;

    const totals = await getDutyTotals();
    const row = totals[name] || { totalMs: 0, sessions: 0 };
    row.totalMs += elapsed;
    row.sessions += 1;
    totals[name] = row;
    await addon.storage.set('dutyTotals', totals);
    return row;
};

const getArchivedDutyMs = (totals, name) => {
    const key = normalizeAdminName(name);
    const direct = totals[name]?.totalMs;
    if (typeof direct === 'number' && Number.isFinite(direct)) return direct;

    for (const [storedName, row] of Object.entries(totals)) {
        if (normalizeAdminName(storedName) === key && typeof row?.totalMs === 'number') {
            return row.totalMs;
        }
    }

    return 0;
};

const buildDutyStats = (name, onShiftEntry, totals) => {
    const archived = getArchivedDutyMs(totals, name);
    const activeMs = onShiftEntry ? msSince(onShiftEntry.since) : 0;
    const totalMs = archived + activeMs;

    return {
        name,
        onDuty: Boolean(onShiftEntry),
        since: onShiftEntry?.since ?? null,
        currentSessionMs: activeMs,
        archivedDutyMs: archived,
        totalDutyMs: totalMs,
        totalDutyLabel: formatDurationMs(totalMs),
        currentSessionLabel: onShiftEntry ? formatDurationMs(activeMs) : null,
    };
};

const getOnShiftMap = async () => {
    const onShift = await repairOnShiftRows();
    return new Map(onShift.map((row) => [normalizeAdminName(row.name), row]));
};

const buildDutyRoster = async () => {
    const onShift = await repairOnShiftRows();
    const onShiftMap = new Map(onShift.map((row) => [normalizeAdminName(row.name), row]));
    const totals = await getDutyTotals();
    const ingame = await addon.storage.get('ingameSnapshot');
    const staffOnline = Array.isArray(ingame?.snapshot?.staffOnline) ? ingame.snapshot.staffOnline : [];

    const names = new Set([
        ...staffOnline.map((s) => s.name).filter(Boolean),
        ...onShift.map((s) => s.name),
        ...Object.keys(totals),
    ]);

    const roster = [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => {
            const online = staffOnline.find((s) => s.name === name);
            return {
                ...buildDutyStats(name, onShiftMap.get(normalizeAdminName(name)), totals),
                inGame: Boolean(online),
                netid: online?.netid ?? null,
            };
        });

    return { staffOnline, onShift, roster };
};

const pushWs = (event, payload) => {
    if (canWsPush()) addon.ws.push(event, payload);
};

const prunePulse = (events, now = Date.now()) => {
    return events.filter((e) => now - new Date(e.time).getTime() < PULSE_WINDOW_MS);
};

const computePulse = (events) => {
    const recent = prunePulse(events);
    const joins = recent.filter((e) => e.type === 'join').length;
    const drops = recent.filter((e) => e.type === 'drop').length;
    const total = joins + drops;

    let mood = 'quiet';
    if (total >= 16) mood = 'chaotic';
    else if (total >= 9) mood = 'busy';
    else if (total >= 3) mood = 'steady';

    return { joins, drops, total, mood, windowMinutes: 60 };
};

const pushActivity = async (entry) => {
    const activity = await addon.storage.getOr('activity', []);
    activity.unshift(entry);
    await addon.storage.set('activity', activity.slice(0, MAX_ACTIVITY));

    const pulseEvents = prunePulse(await addon.storage.getOr('pulseEvents', []));
    pulseEvents.push({ type: entry.type, time: entry.time });
    await addon.storage.set('pulseEvents', pulseEvents);

    return computePulse(pulseEvents);
};

const buildGreetingResponse = async (name) => {
    const visits = (await addon.storage.getOr('visits', 0)) + 1;
    await addon.storage.set('visits', visits);

    const flair =
        visits % 7 === 0
            ? ' Lucky seven — go touch grass after this deploy.'
            : visits % 3 === 0
              ? ' Traffic looks normal. Suspiciously normal.'
              : '';

    return {
        status: 200,
        body: {
            message: `Hey ${name}, shift board online (ping #${visits}).${flair}`,
            adminName: name,
            visits,
            addonId: addon.id,
        },
    };
};

// ── Discord + panel share /greeting ──

addon.registerRoute('GET', '/greeting', async (req) => {
    return await buildGreetingResponse(req.admin.name);
});

addon.registerRoute('POST', '/greeting', async (req) => {
    const requestedName = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 32) : '';
    const name = requestedName || req.admin.name;
    return await buildGreetingResponse(name);
});

// ── One-shot load for the page ──

addon.registerRoute('GET', '/dashboard', async (req) => {
    const pins = await addon.storage.getOr('pins', []);
    const onShift = await addon.storage.getOr('onShift', []);
    const activity = await addon.storage.getOr('activity', []);
    const visits = await addon.storage.getOr('visits', 0);
    const pulse = computePulse(await addon.storage.getOr('pulseEvents', []));
    const youOnShift = Boolean(findShiftEntry(onShift, req.admin.name));

    return {
        status: 200,
        body: {
            adminName: req.admin.name,
            visits,
            pins,
            onShift,
            youOnShift,
            activity,
            pulse,
            wsPushGranted: canWsPush(),
            canWrite: req.admin.hasPermission('players.write'),
        },
    };
});

addon.registerRoute('GET', '/stats', async (req) => {
    const pins = await addon.storage.getOr('pins', []);
    const onShift = await repairOnShiftRows();
    const pulse = computePulse(await addon.storage.getOr('pulseEvents', []));
    const totals = await getDutyTotals();
    const youShift = findShiftEntry(onShift, req.admin.name);
    const youDuty = buildDutyStats(req.admin.name, youShift, totals);
    const { staffOnline, roster } = await buildDutyRoster();

    return {
        status: 200,
        body: {
            adminName: req.admin.name,
            visits: await addon.storage.getOr('visits', 0),
            pinCount: pins.length,
            onShiftCount: onShift.length,
            onShift,
            youOnShift: Boolean(youShift),
            youDuty,
            staffOnlineCount: staffOnline.length,
            staffOnDutyCount: roster.filter((r) => r.onDuty).length,
            canWrite: req.admin.hasPermission('players.write'),
            canViewDutyHours: req.admin.hasPermission(PERM_VIEW_DUTY_HOURS),
            pulse,
            wsPushGranted: canWsPush(),
        },
    };
});

// ── Pins (was "notes" — same storage pattern, richer shape) ──

addon.registerRoute('GET', '/pins', async () => {
    return { status: 200, body: { pins: await addon.storage.getOr('pins', []) } };
});

addon.registerRoute('POST', '/pins', async (req) => {
    if (!req.admin.hasPermission('players.write')) {
        return { status: 403, body: { error: 'Requires players.write' } };
    }

    const { text, kind = 'memo' } = req.body || {};
    if (!text || typeof text !== 'string') {
        return { status: 400, body: { error: 'text is required' } };
    }

    const pinKind = PIN_KINDS.has(kind) ? kind : 'memo';
    const pins = await addon.storage.getOr('pins', []);
    const pin = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: pinKind,
        text: text.trim().slice(0, 280),
        author: req.admin.name,
        createdAt: new Date().toISOString(),
    };
    pins.unshift(pin);
    await addon.storage.set('pins', pins.slice(0, 50));

    pushWs('pins:updated', { count: pins.length, pin });
    return { status: 200, body: { success: true, pin } };
});

addon.registerRoute('DELETE', '/pins/:id', async (req) => {
    if (!req.admin.hasPermission('players.write')) {
        return { status: 403, body: { error: 'Requires players.write' } };
    }

    const pins = await addon.storage.getOr('pins', []);
    let next;

    const legacyMatch = /^legacy-(\d+)$/.exec(req.params.id);
    if (legacyMatch) {
        const index = Number.parseInt(legacyMatch[1], 10);
        if (!Number.isFinite(index) || index < 0 || index >= pins.length) {
            return { status: 404, body: { error: 'pin not found' } };
        }
        next = pins.slice();
        next.splice(index, 1);
    } else {
        next = pins.filter((p) => p.id !== req.params.id);
        if (next.length === pins.length) {
            return { status: 404, body: { error: 'pin not found' } };
        }
    }

    await addon.storage.set('pins', next);
    pushWs('pins:updated', { count: next.length });
    return { status: 200, body: { success: true, count: next.length } };
});

// Back-compat alias so older panel fetches still work during dev
addon.registerRoute('GET', '/notes', async () => {
    const pins = await addon.storage.getOr('pins', []);
    return { status: 200, body: { notes: pins } };
});

// ── Duty roster & hours ──

addon.registerRoute('GET', '/duty/roster', async (req) => {
    const { staffOnline, onShift, roster } = await buildDutyRoster();
    const totals = await getDutyTotals();
    const youShift = findShiftEntry(onShift, req.admin.name);

    return {
        status: 200,
        body: {
            staffOnline,
            onShift,
            roster,
            you: buildDutyStats(req.admin.name, youShift, totals),
            canViewDutyHours: req.admin.hasPermission(PERM_VIEW_DUTY_HOURS),
        },
    };
});

addon.registerRoute('GET', '/duty/me', async (req) => {
    const onShift = await repairOnShiftRows();
    const youShift = findShiftEntry(onShift, req.admin.name);
    const totals = await getDutyTotals();

    return {
        status: 200,
        body: buildDutyStats(req.admin.name, youShift, totals),
    };
});

addon.registerRoute('GET', '/duty/hours', async (req) => {
    if (!req.admin.hasPermission(PERM_VIEW_DUTY_HOURS)) {
        return { status: 403, body: { error: 'Requires View Duty Hours permission' } };
    }

    const onShift = await repairOnShiftRows();
    const onShiftMap = await getOnShiftMap();
    const totals = await getDutyTotals();
    const names = new Set([...Object.keys(totals), ...onShift.map((s) => s.name)]);

    const staff = [...names]
        .map((name) => buildDutyStats(name, onShiftMap.get(normalizeAdminName(name)), totals))
        .sort((a, b) => b.totalDutyMs - a.totalDutyMs);

    return {
        status: 200,
        body: {
            staff,
            generatedAt: new Date().toISOString(),
        },
    };
});

addon.registerRoute('POST', '/shift/toggle', async (req) => {
    const onShift = await repairOnShiftRows();
    const idx = findShiftIndex(onShift, req.admin.name);

    if (idx >= 0) {
        const ended = onShift[idx];
        await finalizeDutySession(ended.name, ended.since);
        onShift.splice(idx, 1);
    } else {
        onShift.push({
            name: req.admin.name,
            since: new Date().toISOString(),
        });
    }

    await addon.storage.set('onShift', onShift);
    const totals = await getDutyTotals();
    const youShift = findShiftEntry(onShift, req.admin.name);
    const youDuty = buildDutyStats(req.admin.name, youShift, totals);

    pushWs('shift:updated', { onShift, youDuty });
    pushWs('duty:updated', { youDuty });

    return {
        status: 200,
        body: {
            onShift,
            youOnShift: idx < 0,
            youDuty,
        },
    };
});

// ── Game events → storage + ws ──

addon.on('playerJoining', async (data) => {
    addon.log.info(`playerJoining: ${data.displayName} (${data.netid})`);

    const entry = {
        type: 'join',
        name: data.displayName,
        netid: data.netid,
        license: data.license,
        time: new Date().toISOString(),
    };
    const pulse = await pushActivity(entry);
    pushWs('player:joined', { ...entry, pulse });
});

addon.on('playerDropped', async (data) => {
    addon.log.info(`playerDropped: netid ${data.netid} — ${data.reason}`);

    const entry = {
        type: 'drop',
        netid: data.netid,
        reason: data.reason,
        time: new Date().toISOString(),
    };
    const pulse = await pushActivity(entry);
    pushWs('player:dropped', { ...entry, pulse });
});

addon.registerRoute('GET', '/activity', async () => {
    const activity = await addon.storage.getOr('activity', []);
    const pulse = computePulse(await addon.storage.getOr('pulseEvents', []));
    return { status: 200, body: { activity, pulse } };
});

// ── In-game bridge (Lua → client NUI → POST here → panel GET /ingame) ──

const MAX_INGAME_SNAPSHOT_BYTES = 8_192;

addon.registerRoute('POST', '/ingame/push', async (req) => {
    const snapshot = req.body?.snapshot;
    if (!snapshot || typeof snapshot !== 'object') {
        return { status: 400, body: { error: 'snapshot object is required' } };
    }

    let encoded;
    try {
        encoded = JSON.stringify(snapshot);
    } catch {
        return { status: 400, body: { error: 'snapshot must be JSON-serializable' } };
    }

    if (encoded.length > MAX_INGAME_SNAPSHOT_BYTES) {
        return { status: 413, body: { error: 'snapshot too large' } };
    }

    const record = {
        snapshot,
        pushedAt: new Date().toISOString(),
        pushedBy: req.admin.name,
    };
    await addon.storage.set('ingameSnapshot', record);
    pushWs('ingame:updated', { pushedAt: record.pushedAt });

    return { status: 200, body: { success: true, pushedAt: record.pushedAt } };
});

addon.registerRoute('GET', '/ingame', async (req) => {
    const ingame = await addon.storage.get('ingameSnapshot');
    const pulse = computePulse(await addon.storage.getOr('pulseEvents', []));
    const { staffOnline, onShift, roster } = await buildDutyRoster();
    const totals = await getDutyTotals();
    const youShift = findShiftEntry(onShift, req.admin.name);

    return {
        status: 200,
        body: {
            adminName: req.admin.name,
            ingame: ingame ?? null,
            pulse,
            onShiftCount: onShift.length,
            staffOnline,
            roster,
            you: buildDutyStats(req.admin.name, youShift, totals),
            canViewDutyHours: req.admin.hasPermission(PERM_VIEW_DUTY_HOURS),
        },
    };
});

addon.log.info('addon-starter-template server loaded');
addon.registerDeferralScenario({
    id: 'shift_closed',
    label: 'Shift board — closed',
    description: 'Shown when this addon denies a join (see deferPresent).',
    group: 'addon',
});

addon.registerDeferralToken({
    key: 'shiftNote',
    label: 'Shift note',
    resolve: async () => 'Shift applications are closed. Check Discord for hours.',
});

addon.ready();
