/**
 * Starter template — panel entry (`addon.json` → `panel.entry`)
 *
 * Match sxPanel panel tokens (card, badge, page header). Icons are inline SVG
 * (lucide paths) — React is global, don't bundle.
 */

/* global React, globalThis */
const { createElement: h, useState, useEffect, useCallback } = React;

const ADDON_ID = 'addon-starter-template';
const API_BASE = `/addons/${ADDON_ID}/api`;

/** @type {Record<string, Array<[string, Record<string, string | number>]>>} */
const ICONS = {
    radio: [
        ['path', { d: 'M16.247 7.411a6 6 0 0 1 0 9.178' }],
        ['path', { d: 'M4.5 8.813a9 9 0 0 1 15 6.374' }],
        ['path', { d: 'M2 12a10 10 0 0 1 20 0' }],
        ['circle', { cx: 12, cy: 12, r: 2 }],
    ],
    moon: [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
    activity: [
        ['path', { d: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a2 2 0 0 1-3.88 0l-2.35-8.36A2 2 0 0 0 7.48 12H2' }],
    ],
    flame: [
        [
            'path',
            {
                d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
            },
        ],
    ],
    zap: [
        [
            'path',
            {
                d: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.85-.46l1.92-6.02A1 1 0 0 0 11 14z',
            },
        ],
    ],
    users: [
        ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
        ['circle', { cx: 9, cy: 7, r: 4 }],
        ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
        ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }],
    ],
    logIn: [
        ['path', { d: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4' }],
        ['polyline', { points: '10 17 15 12 10 7' }],
        ['line', { x1: 15, x2: 3, y1: 12, y2: 12 }],
    ],
    logOut: [
        ['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }],
        ['polyline', { points: '16 17 21 12 16 7' }],
        ['line', { x1: 21, x2: 9, y1: 12, y2: 12 }],
    ],
    pin: [
        ['line', { x1: 12, x2: 12, y1: 17, y2: 22 }],
        [
            'path',
            {
                d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z',
            },
        ],
    ],
    triangleAlert: [
        ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
        ['path', { d: 'M12 9v4' }],
        ['path', { d: 'M12 17h.01' }],
    ],
    trophy: [
        ['path', { d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' }],
        ['path', { d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' }],
        ['path', { d: 'M4 22h16' }],
        ['path', { d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' }],
        ['path', { d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' }],
        ['path', { d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' }],
    ],
    wifi: [
        ['path', { d: 'M12 20h.01' }],
        ['path', { d: 'M2 8.82a15 15 0 0 1 20 0' }],
        ['path', { d: 'M5 12.859a10 10 0 0 1 14 0' }],
        ['path', { d: 'M8.5 16.429a5 5 0 0 1 7 0' }],
    ],
    wifiOff: [
        ['line', { x1: 2, x2: 22, y1: 2, y2: 22 }],
        ['path', { d: 'M8.5 16.5a5 5 0 0 1 7 0' }],
        ['path', { d: 'M2 8.82a15 15 0 0 1 4.17-2.65' }],
        ['path', { d: 'M10.66 5c4.01-.36 8.14.94 11.34 3.76' }],
    ],
    trash: [
        ['path', { d: 'M3 6h18' }],
        ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
        ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
    ],
    chevronDown: [['path', { d: 'm6 9 6 6 6-6' }]],
    chevronRight: [['path', { d: 'm9 18 6-6-6-6' }]],
    radioTower: [
        ['path', { d: 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9' }],
        ['path', { d: 'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5' }],
        ['circle', { cx: 12, cy: 12, r: 2 }],
        ['path', { d: 'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5' }],
        ['path', { d: 'M19.1 4.9C23 8.8 23 15.1 19.1 19' }],
    ],
};

function Icon({ name, className = 'size-4 shrink-0' }) {
    const nodes = ICONS[name];
    if (!nodes) return null;
    return h(
        'svg',
        {
            xmlns: 'http://www.w3.org/2000/svg',
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            className,
            'aria-hidden': true,
        },
        ...nodes.map(([tag, attrs]) => h(tag, attrs)),
    );
}

const PIN_KINDS = [
    { id: 'memo', label: 'Memo', icon: 'pin' },
    { id: 'alert', label: 'Alert', icon: 'triangleAlert' },
    { id: 'win', label: 'Win', icon: 'trophy' },
];

const MOOD_META = {
    quiet: { label: 'Quiet', icon: 'moon', bar: 'w-1/4', badge: 'border-border/50 bg-muted text-muted-foreground' },
    steady: {
        label: 'Steady',
        icon: 'activity',
        bar: 'w-2/4',
        badge: 'border-success/30 bg-success/10 text-success-inline',
    },
    busy: { label: 'Busy', icon: 'flame', bar: 'w-3/4', badge: 'border-warning/30 bg-warning/10 text-warning-inline' },
    chaotic: {
        label: 'Chaotic',
        icon: 'zap',
        bar: 'w-full',
        badge: 'border-destructive/30 bg-destructive/10 text-destructive-inline',
    },
};

const BTN =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
const BTN_PRIMARY = `${BTN} bg-primary text-primary-foreground hover:bg-primary/75 h-9 px-4`;
const BTN_OUTLINE = `${BTN} border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4`;
const BTN_GHOST = `${BTN} hover:bg-muted text-muted-foreground h-8 px-2`;
const INPUT =
    'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function Card({ className = '', children }) {
    return h(
        'div',
        {
            className: `bg-card text-card-foreground border-border/60 rounded-xl border shadow-sm ${className}`.trim(),
        },
        children,
    );
}

function CardHeader({ className = '', children }) {
    return h('div', { className: `flex flex-col space-y-1.5 p-6 ${className}`.trim() }, children);
}

function CardTitle({ children, className = '' }) {
    return h(
        'h3',
        {
            className: `text-lg font-semibold leading-none tracking-tight text-foreground ${className}`.trim(),
        },
        children,
    );
}

function CardDescription({ children }) {
    return h('p', { className: 'text-sm text-muted-foreground' }, children);
}

function CardContent({ className = '', children }) {
    return h('div', { className: `p-6 pt-0 ${className}`.trim() }, children);
}

function Badge({ children, className = '' }) {
    return h(
        'span',
        {
            className:
                `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${className}`.trim(),
        },
        children,
    );
}

function getHeaders() {
    return globalThis.txAddonApi?.getHeaders() ?? { 'Content-Type': 'application/json' };
}

async function apiFetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'same-origin',
        headers: getHeaders(),
        ...opts,
    });
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${res.status})`);
    }
    return res.json();
}

const QUIET_PULSE = { mood: 'quiet', joins: 0, drops: 0 };

function panelAdminName() {
    const auth = globalThis.txConsts?.preAuth;
    if (!auth || typeof auth !== 'object') return null;
    return auth.name || auth.username || null;
}

function panelCanWrite() {
    const auth = globalThis.txConsts?.preAuth;
    if (!auth || typeof auth !== 'object') return false;
    const perms = auth.permissions || [];
    return perms.includes('all_permissions') || perms.includes('players.write');
}

function panelCanViewDutyHours() {
    const auth = globalThis.txConsts?.preAuth;
    if (!auth || typeof auth !== 'object') return false;
    const perms = auth.permissions || [];
    return perms.includes('all_permissions') || perms.includes('addon-starter-template.view-duty-hours');
}

function msSinceIso(iso) {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return 0;
    return Math.max(0, Date.now() - t);
}

function formatDurationMs(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '0s';
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/** Recompute live session/total from server payload + `since` (API values are point-in-time). */
function liveDutyStats(duty) {
    if (!duty) return null;
    const archived = duty.archivedDutyMs ?? 0;
    const active = duty.onDuty && duty.since ? msSinceIso(duty.since) : 0;
    const totalMs = archived + active;
    return {
        ...duty,
        currentSessionMs: active,
        totalDutyMs: totalMs,
        currentSessionLabel: duty.onDuty ? formatDurationMs(active) : null,
        totalDutyLabel: formatDurationMs(totalMs),
    };
}

async function fetchPinsList() {
    try {
        const res = await apiFetch('/pins');
        return res.pins ?? [];
    } catch {
        try {
            const res = await apiFetch('/notes');
            const rows = res.notes ?? [];
            return rows.map((pin, index) => ({
                ...pin,
                id: pin.id ?? `legacy-${index}`,
                kind: pin.kind ?? 'memo',
            }));
        } catch {
            return [];
        }
    }
}

async function fetchDashboardPayload() {
    const canViewDutyHours = panelCanViewDutyHours();
    const [stats, activityPayload, pins, dutyPayload, dutyHoursPayload] = await Promise.all([
        apiFetch('/stats').catch(() => ({})),
        apiFetch('/activity').catch(() => ({ activity: [], pulse: QUIET_PULSE })),
        fetchPinsList(),
        apiFetch('/duty/roster').catch(() => ({ roster: [], staffOnline: [], you: null })),
        canViewDutyHours ? apiFetch('/duty/hours').catch(() => ({ staff: [] })) : Promise.resolve({ staff: [] }),
    ]);

    return {
        adminName: stats.adminName || panelAdminName() || 'Admin',
        visits: stats.visits ?? 0,
        pins,
        onShift: stats.onShift ?? dutyPayload.onShift ?? [],
        youOnShift: stats.youOnShift ?? dutyPayload.you?.onDuty ?? false,
        youDuty: stats.youDuty ?? dutyPayload.you ?? null,
        roster: dutyPayload.roster ?? [],
        staffOnline: dutyPayload.staffOnline ?? [],
        dutyHours: dutyHoursPayload.staff ?? [],
        activity: activityPayload.activity ?? [],
        pulse: activityPayload.pulse ?? stats.pulse ?? QUIET_PULSE,
        wsPushGranted: stats.wsPushGranted ?? false,
        canWrite: stats.canWrite ?? panelCanWrite(),
        canViewDutyHours: stats.canViewDutyHours ?? canViewDutyHours,
        shiftRouteReady: stats.onShift !== undefined,
    };
}

function initials(name) {
    if (!name) return '?';
    return name
        .split(/\s+/)
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
}

function timeAgo(iso) {
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function kindMeta(kind) {
    return PIN_KINDS.find((k) => k.id === kind) || PIN_KINDS[0];
}

function PageHeader({ title, description }) {
    return h(
        'div',
        { className: 'mb-4 md:mb-5' },
        h(
            'div',
            { className: 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between' },
            h(
                'div',
                { className: 'flex min-w-0 items-center gap-2.5 sm:gap-3' },
                h('span', { className: 'bg-primary/70 h-9 w-1 shrink-0 rounded-full sm:h-10' }),
                h(
                    'div',
                    {
                        className:
                            'bg-secondary/40 border-border/50 text-accent/80 flex size-9 shrink-0 items-center justify-center rounded-lg border sm:h-10 sm:w-10',
                    },
                    h(Icon, { name: 'radio', className: 'size-4 sm:size-5' }),
                ),
                h(
                    'div',
                    { className: 'min-w-0' },
                    h(
                        'h1',
                        {
                            className:
                                'text-foreground truncate text-xl font-semibold leading-tight tracking-tight sm:text-2xl',
                        },
                        title,
                    ),
                    description &&
                        h(
                            'p',
                            {
                                className: 'text-muted-foreground/80 mt-0.5 truncate text-xs sm:text-sm',
                            },
                            description,
                        ),
                ),
            ),
        ),
        h('div', { className: 'border-border/40 mt-3 border-b sm:mt-4' }),
    );
}

function PulseCard({ pulse, visits, wsPushGranted }) {
    const mood = MOOD_META[pulse?.mood] || MOOD_META.quiet;
    return h(
        Card,
        null,
        h(
            CardHeader,
            { className: 'pb-2' },
            h(
                'div',
                { className: 'flex flex-wrap items-start justify-between gap-3' },
                h(
                    'div',
                    null,
                    h(CardTitle, null, 'Server pulse'),
                    h(
                        CardDescription,
                        null,
                        `${pulse?.joins ?? 0} joins · ${pulse?.drops ?? 0} drops in the last hour`,
                    ),
                ),
                h(Badge, { className: mood.badge }, h(Icon, { name: mood.icon, className: 'size-3.5' }), mood.label),
            ),
        ),
        h(
            CardContent,
            null,
            h(
                'div',
                { className: 'flex flex-wrap items-end justify-between gap-4' },
                h(
                    'div',
                    { className: 'flex items-center gap-3' },
                    h(
                        'div',
                        {
                            className:
                                'bg-secondary/40 border-border/50 flex size-12 items-center justify-center rounded-lg border',
                        },
                        h(Icon, { name: mood.icon, className: 'size-6 text-accent/90' }),
                    ),
                    h(
                        'div',
                        null,
                        h('p', { className: 'text-2xl font-semibold tracking-tight text-foreground' }, mood.label),
                        h('p', { className: 'text-xs text-muted-foreground' }, 'Traffic mood'),
                    ),
                ),
                h(
                    'div',
                    { className: 'flex flex-wrap gap-2' },
                    h(
                        'div',
                        {
                            className:
                                'border-border/50 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
                        },
                        h(Icon, { name: 'radioTower', className: 'text-muted-foreground/70 size-3' }),
                        h('span', { className: 'font-mono font-semibold text-foreground' }, String(visits ?? 0)),
                        h('span', { className: 'text-muted-foreground/70' }, 'API hits'),
                    ),
                    h(
                        'div',
                        {
                            className:
                                'border-border/50 bg-card flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
                        },
                        h(Icon, {
                            name: wsPushGranted ? 'wifi' : 'wifiOff',
                            className: wsPushGranted ? 'text-success-inline size-3' : 'text-muted-foreground/70 size-3',
                        }),
                        h(
                            'span',
                            { className: 'font-mono font-semibold text-foreground' },
                            wsPushGranted ? 'Live' : 'Off',
                        ),
                        h('span', { className: 'text-muted-foreground/70' }, 'realtime'),
                    ),
                ),
            ),
            h(
                'div',
                { className: 'bg-muted mt-4 h-1.5 overflow-hidden rounded-full' },
                h('div', { className: `bg-primary h-full rounded-full transition-all ${mood.bar}` }),
            ),
        ),
    );
}

function StaffDutyCard({ roster, staffOnline, youDuty, youOnShift, onToggle, busy, shiftReady }) {
    const safeRoster = Array.isArray(roster) ? roster : [];
    const safeStaffOnline = Array.isArray(staffOnline) ? staffOnline : [];
    const liveYou = liveDutyStats(youDuty);
    const liveRoster = safeRoster.map((row) => liveDutyStats(row) || row);
    const inGameCount = safeStaffOnline.length || liveRoster.filter((r) => r.inGame).length;
    const onDutyCount = liveRoster.filter((r) => r.onDuty).length;

    return h(
        Card,
        null,
        h(
            CardHeader,
            { className: 'flex-row items-start justify-between gap-3 space-y-0 pb-2' },
            h(
                'div',
                { className: 'min-w-0' },
                h(CardTitle, null, 'Staff & duty'),
                h(CardDescription, null, `${inGameCount} in-game · ${onDutyCount} on duty`),
                liveYou &&
                    h(
                        'p',
                        { className: 'text-foreground mt-2 text-sm' },
                        liveYou.onDuty
                            ? `You: ${liveYou.currentSessionLabel} this session · ${liveYou.totalDutyLabel} total`
                            : `You: ${liveYou.totalDutyLabel} total duty (off duty)`,
                    ),
            ),
            h(
                'button',
                {
                    type: 'button',
                    className: youOnShift ? BTN_PRIMARY : BTN_OUTLINE,
                    disabled: busy || !shiftReady,
                    title: shiftReady ? undefined : 'Reload addon on the Addons page first',
                    onClick: onToggle,
                },
                h(Icon, { name: youOnShift ? 'logOut' : 'logIn', className: 'size-4' }),
                youOnShift ? 'Clock out' : 'Clock in',
            ),
        ),
        h(
            CardContent,
            null,
            liveRoster.length === 0
                ? h(
                      'p',
                      { className: 'text-sm text-muted-foreground' },
                      'Open the in-game admin menu once so Lua can report which staff are connected.',
                  )
                : h(
                      'ul',
                      { className: 'space-y-2' },
                      liveRoster.map((row) =>
                          h(
                              'li',
                              {
                                  key: row.name,
                                  className:
                                      'border-border/50 bg-card/80 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2',
                              },
                              h(
                                  'div',
                                  { className: 'flex min-w-0 items-center gap-2' },
                                  h(
                                      'span',
                                      {
                                          className:
                                              'bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                                      },
                                      initials(row.name),
                                  ),
                                  h(
                                      'div',
                                      { className: 'min-w-0' },
                                      h('p', { className: 'text-foreground truncate text-sm font-medium' }, row.name),
                                      h(
                                          'p',
                                          { className: 'text-muted-foreground text-xs' },
                                          row.inGame
                                              ? `In-game${row.netid != null ? ` · #${row.netid}` : ''}`
                                              : 'Not in-game',
                                      ),
                                  ),
                              ),
                              h(
                                  'div',
                                  { className: 'flex flex-wrap items-center gap-2' },
                                  row.onDuty
                                      ? h(
                                            Badge,
                                            { className: 'border-success/30 bg-success/10 text-success-inline' },
                                            'On duty',
                                            row.currentSessionLabel && ` · ${row.currentSessionLabel}`,
                                        )
                                      : h(
                                            Badge,
                                            { className: 'border-border/50 bg-muted text-muted-foreground' },
                                            'Off duty',
                                        ),
                                  h(
                                      'span',
                                      { className: 'text-muted-foreground font-mono text-xs' },
                                      row.totalDutyLabel || formatDurationMs(row.totalDutyMs),
                                  ),
                              ),
                          ),
                      ),
                  ),
        ),
    );
}

function DutyHoursCard({ staff, canView }) {
    const liveStaff = (Array.isArray(staff) ? staff : []).map((row) => liveDutyStats(row) || row);

    if (!canView) {
        return h(
            Card,
            { className: 'border-dashed' },
            h(
                CardHeader,
                { className: 'pb-2' },
                h(CardTitle, null, 'Duty hours (all staff)'),
                h(CardDescription, null, 'Requires the View Duty Hours addon permission'),
            ),
            h(
                CardContent,
                null,
                h(
                    'p',
                    { className: 'text-muted-foreground text-sm' },
                    'Grant addon-starter-template.view-duty-hours in Admin → Roles to see cumulative hours for everyone.',
                ),
            ),
        );
    }

    return h(
        Card,
        null,
        h(
            CardHeader,
            { className: 'pb-2' },
            h(CardTitle, null, 'Duty hours (all staff)'),
            h(CardDescription, null, 'Cumulative time while clocked in (saved when clocking out)'),
        ),
        h(
            CardContent,
            null,
            liveStaff.length === 0
                ? h('p', { className: 'text-sm text-muted-foreground' }, 'No duty history yet.')
                : h(
                      'div',
                      { className: 'overflow-x-auto' },
                      h(
                          'table',
                          { className: 'w-full text-left text-sm' },
                          h(
                              'thead',
                              null,
                              h(
                                  'tr',
                                  { className: 'text-muted-foreground border-border/50 border-b text-xs' },
                                  h('th', { className: 'pb-2 pr-4 font-medium' }, 'Staff'),
                                  h('th', { className: 'pb-2 pr-4 font-medium' }, 'Status'),
                                  h('th', { className: 'pb-2 pr-4 font-medium' }, 'This session'),
                                  h('th', { className: 'pb-2 font-medium' }, 'Total duty'),
                              ),
                          ),
                          h(
                              'tbody',
                              null,
                              liveStaff.map((row) =>
                                  h(
                                      'tr',
                                      {
                                          key: row.name,
                                          className: 'border-border/40 border-b last:border-0',
                                      },
                                      h('td', { className: 'py-2.5 pr-4 font-medium text-foreground' }, row.name),
                                      h(
                                          'td',
                                          { className: 'py-2.5 pr-4' },
                                          row.onDuty
                                              ? h(
                                                    Badge,
                                                    {
                                                        className:
                                                            'border-success/30 bg-success/10 text-success-inline',
                                                    },
                                                    'On duty',
                                                )
                                              : h('span', { className: 'text-muted-foreground' }, 'Off'),
                                      ),
                                      h(
                                          'td',
                                          { className: 'text-muted-foreground py-2.5 pr-4 font-mono text-xs' },
                                          row.onDuty
                                              ? row.currentSessionLabel || formatDurationMs(row.currentSessionMs)
                                              : '—',
                                      ),
                                      h(
                                          'td',
                                          { className: 'text-foreground py-2.5 font-mono text-xs' },
                                          row.totalDutyLabel || formatDurationMs(row.totalDutyMs),
                                      ),
                                  ),
                              ),
                          ),
                      ),
                  ),
        ),
    );
}

function TrafficCard({ feed, pulse }) {
    const mood = MOOD_META[pulse?.mood] || MOOD_META.quiet;
    return h(
        Card,
        { className: 'h-full' },
        h(
            CardHeader,
            { className: 'flex-row items-center justify-between space-y-0 pb-2' },
            h('div', null, h(CardTitle, null, 'Live traffic'), h(CardDescription, null, 'Join and drop events')),
            h(Badge, { className: mood.badge }, h(Icon, { name: mood.icon, className: 'size-3.5' }), mood.label),
        ),
        h(
            CardContent,
            null,
            feed.length === 0
                ? h('p', { className: 'text-sm text-muted-foreground' }, 'No recent joins or drops.')
                : h(
                      'ul',
                      { className: 'max-h-52 space-y-2 overflow-y-auto pr-1', style: { scrollbarWidth: 'thin' } },
                      feed.map((row, i) => {
                          const isJoin = row.kind === 'join';
                          return h(
                              'li',
                              {
                                  key: `${row.time}-${i}`,
                                  className: `flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm ${
                                      isJoin
                                          ? 'border-success/20 bg-success/5'
                                          : 'border-destructive/20 bg-destructive/5'
                                  }`,
                              },
                              h(Icon, {
                                  name: isJoin ? 'logIn' : 'logOut',
                                  className: isJoin
                                      ? 'text-success-inline mt-0.5 size-4'
                                      : 'text-destructive-inline mt-0.5 size-4',
                              }),
                              h(
                                  'div',
                                  { className: 'min-w-0 flex-1' },
                                  h(
                                      'p',
                                      { className: 'text-foreground leading-snug' },
                                      isJoin ? `${row.name} connected` : `Dropped · netid ${row.netid}`,
                                  ),
                                  !isJoin &&
                                      row.reason &&
                                      h('p', { className: 'text-muted-foreground text-xs' }, row.reason),
                                  h('p', { className: 'text-muted-foreground/70 mt-0.5 text-xs' }, timeAgo(row.time)),
                              ),
                          );
                      }),
                  ),
        ),
    );
}

function PinsCard({ pins, canWrite, draft, setDraft, pinKind, setPinKind, onPost, onDelete, busy }) {
    return h(
        Card,
        null,
        h(
            CardHeader,
            { className: 'pb-2' },
            h(CardTitle, null, 'Pin wall'),
            h(CardDescription, null, canWrite ? 'Leave a note for the next shift' : 'Requires players.write to post'),
        ),
        h(
            CardContent,
            { className: 'space-y-4' },
            canWrite
                ? h(
                      'div',
                      { className: 'space-y-3' },
                      h(
                          'div',
                          { className: 'flex flex-wrap gap-2' },
                          PIN_KINDS.map((k) =>
                              h(
                                  'button',
                                  {
                                      key: k.id,
                                      type: 'button',
                                      className:
                                          pinKind === k.id
                                              ? 'border-primary bg-primary/10 text-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium'
                                              : 'border-border/60 text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                                      onClick: () => setPinKind(k.id),
                                  },
                                  h(Icon, { name: k.icon, className: 'size-3.5' }),
                                  k.label,
                              ),
                          ),
                      ),
                      h(
                          'div',
                          { className: 'flex gap-2' },
                          h('input', {
                              type: 'text',
                              className: INPUT,
                              placeholder: 'Heads-up for the next shift…',
                              value: draft,
                              maxLength: 280,
                              onChange: (e) => setDraft(e.target.value),
                              onKeyDown: (e) => e.key === 'Enter' && onPost(),
                          }),
                          h(
                              'button',
                              {
                                  type: 'button',
                                  className: BTN_PRIMARY,
                                  disabled: busy || !draft.trim(),
                                  onClick: onPost,
                              },
                              'Post',
                          ),
                      ),
                  )
                : h(
                      'p',
                      { className: 'text-warning-inline text-sm' },
                      'You can view pins but need players.write to post.',
                  ),

            pins.length === 0
                ? h('p', { className: 'text-sm text-muted-foreground' }, 'No pins yet.')
                : h(
                      'ul',
                      { className: 'space-y-2' },
                      pins.map((pin) => {
                          const meta = kindMeta(pin.kind);
                          return h(
                              'li',
                              {
                                  key: pin.id,
                                  className: 'odd:bg-card/75 flex gap-3 rounded-md border px-3 py-2.5',
                              },
                              h(Icon, {
                                  name: meta.icon,
                                  className: 'text-muted-foreground/70 mt-0.5 size-4 shrink-0',
                              }),
                              h(
                                  'div',
                                  { className: 'min-w-0 flex-1' },
                                  h(
                                      'p',
                                      { className: 'text-muted-foreground text-xs' },
                                      `${meta.label} · ${pin.author} · ${timeAgo(pin.createdAt)}`,
                                  ),
                                  h('p', { className: 'text-foreground mt-1 text-sm leading-relaxed' }, pin.text),
                              ),
                              canWrite &&
                                  h(
                                      'button',
                                      {
                                          type: 'button',
                                          className: BTN_GHOST,
                                          'aria-label': 'Delete pin',
                                          onClick: () => onDelete(pin.id),
                                      },
                                      h(Icon, { name: 'trash', className: 'size-4' }),
                                  ),
                          );
                      }),
                  ),
        ),
    );
}

function DevDrawer({ open, onToggle }) {
    const files = [
        ['addon.json', 'manifest'],
        ['server/index.js', 'routes, storage, events, ws.push'],
        ['panel/index.js', 'this UI'],
        ['resource/*.lua + nui/', 'in-game Lua → NUI → /ingame/push'],
        ['discord-bot/commands/', 'slash → addonRoute'],
    ];

    return h(
        Card,
        { className: 'border-dashed shadow-none' },
        h(
            'button',
            {
                type: 'button',
                className:
                    'text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-6 py-4 text-left text-sm',
                onClick: onToggle,
            },
            h('span', { className: 'font-medium' }, 'Developer map'),
            h(Icon, { name: open ? 'chevronDown' : 'chevronRight', className: 'size-4' }),
        ),
        open &&
            h(
                CardContent,
                { className: 'border-border/40 border-t pt-4' },
                h(
                    'ul',
                    { className: 'text-muted-foreground space-y-2 font-mono text-xs' },
                    files.map(([f, d]) =>
                        h(
                            'li',
                            { key: f, className: 'flex flex-col gap-0.5 sm:flex-row sm:gap-2' },
                            h('span', { className: 'text-foreground' }, f),
                            h('span', null, d),
                        ),
                    ),
                ),
            ),
    );
}

function StarterPage() {
    const [dash, setDash] = useState(null);
    const [liveFeed, setLiveFeed] = useState([]);
    const [draft, setDraft] = useState('');
    const [pinKind, setPinKind] = useState('memo');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [devOpen, setDevOpen] = useState(false);
    const [nowTick, setNowTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setNowTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const loadDashboard = useCallback(async () => {
        setError(null);
        try {
            setDash(await fetchDashboardPayload());
        } catch (err) {
            console.error('[addon-starter-template]', err);
            setError(err.message);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    useEffect(() => {
        const socketApi = globalThis.txAddonApi?.socket;
        if (!socketApi) return undefined;

        const socket = socketApi.get();
        const p = `addon:${ADDON_ID}:`;
        const refresh = () => {
            loadDashboard();
        };
        const onJoin = (payload) => {
            setLiveFeed((prev) => [{ kind: 'join', ...payload }, ...prev].slice(0, 12));
            if (payload.pulse) setDash((d) => (d ? { ...d, pulse: payload.pulse } : d));
            loadDashboard();
        };
        const onDrop = (payload) => {
            setLiveFeed((prev) => [{ kind: 'drop', ...payload }, ...prev].slice(0, 12));
            if (payload.pulse) setDash((d) => (d ? { ...d, pulse: payload.pulse } : d));
            loadDashboard();
        };

        socket.on(`${p}pins:updated`, refresh);
        socket.on(`${p}shift:updated`, refresh);
        socket.on(`${p}duty:updated`, refresh);
        socket.on(`${p}ingame:updated`, refresh);
        socket.on(`${p}player:joined`, onJoin);
        socket.on(`${p}player:dropped`, onDrop);

        return () => {
            socket.off(`${p}pins:updated`, refresh);
            socket.off(`${p}shift:updated`, refresh);
            socket.off(`${p}duty:updated`, refresh);
            socket.off(`${p}ingame:updated`, refresh);
            socket.off(`${p}player:joined`, onJoin);
            socket.off(`${p}player:dropped`, onDrop);
        };
    }, [loadDashboard]);

    const run = async (fn) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            await loadDashboard();
        } catch (err) {
            const msg = String(err.message);
            setError(/Route not found/i.test(msg) ? `${msg} — reload the addon on the Addons page.` : msg);
        }
        setBusy(false);
    };

    const handleToggleShift = () => run(() => apiFetch('/shift/toggle', { method: 'POST' }));
    const handlePostPin = () => {
        if (!draft.trim()) return;
        run(async () => {
            await apiFetch('/pins', {
                method: 'POST',
                body: JSON.stringify({ text: draft, kind: pinKind }),
            });
            setDraft('');
        });
    };
    const handleDeletePin = (id) => run(() => apiFetch(`/pins/${id}`, { method: 'DELETE' }));

    if (loading) {
        return h(
            'div',
            { className: 'flex min-h-[40vh] items-center justify-center' },
            h('p', { className: 'text-muted-foreground animate-pulse text-sm' }, 'Loading…'),
        );
    }

    const description = dash?.adminName ? `Signed in as ${dash.adminName}` : undefined;

    return h(
        'div',
        { className: 'mx-auto max-w-5xl space-y-4 p-4 md:p-6 md:space-y-5' },
        PageHeader({ title: 'Shift board', description }),

        dash &&
            !dash.shiftRouteReady &&
            h(
                'div',
                {
                    className:
                        'border-warning/30 bg-warning/10 text-warning-inline rounded-lg border px-4 py-3 text-sm',
                    role: 'status',
                },
                'Clock-in needs an addon reload (Addons → Reload). Pins and traffic still work.',
            ),

        error &&
            h(
                'div',
                {
                    className:
                        'border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm',
                    role: 'alert',
                },
                error,
            ),

        dash &&
            PulseCard({
                pulse: dash.pulse,
                visits: dash.visits,
                wsPushGranted: dash.wsPushGranted,
            }),

        dash &&
            StaffDutyCard({
                roster: dash.roster || [],
                staffOnline: dash.staffOnline || [],
                youDuty: dash.youDuty,
                youOnShift: dash.youOnShift,
                onToggle: handleToggleShift,
                busy,
                shiftReady: dash.shiftRouteReady !== false,
            }),

        dash &&
            DutyHoursCard({
                staff: dash.dutyHours || [],
                canView: dash.canViewDutyHours,
            }),

        h(
            'div',
            { className: 'grid gap-4 lg:grid-cols-2' },
            TrafficCard({ feed: liveFeed, pulse: dash?.pulse }),
            dash &&
                h(
                    'div',
                    {
                        className:
                            'text-muted-foreground flex items-center rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm',
                    },
                    'Open the in-game menu to refresh which staff are connected (Lua snapshot).',
                ),
        ),

        dash &&
            PinsCard({
                pins: dash.pins || [],
                canWrite: dash.canWrite,
                draft,
                setDraft,
                pinKind,
                setPinKind,
                onPost: handlePostPin,
                onDelete: handleDeletePin,
                busy,
            }),

        DevDrawer({ open: devOpen, onToggle: () => setDevOpen((v) => !v) }),
    );
}

function StarterWidget() {
    const [stats, setStats] = useState(null);

    useEffect(() => {
        apiFetch('/stats')
            .then(setStats)
            .catch(() => setStats(null));
        const socketApi = globalThis.txAddonApi?.socket;
        if (!socketApi) return undefined;
        const socket = socketApi.get();
        const refresh = () =>
            apiFetch('/stats')
                .then(setStats)
                .catch(() => {});
        const p = `addon:${ADDON_ID}:`;
        ['pins:updated', 'shift:updated', 'duty:updated', 'ingame:updated', 'player:joined', 'player:dropped'].forEach(
            (ev) => {
                socket.on(`${p}${ev}`, refresh);
            },
        );
        return () => {
            ['pins:updated', 'shift:updated', 'player:joined', 'player:dropped'].forEach((ev) => {
                socket.off(`${p}${ev}`, refresh);
            });
        };
    }, []);

    const mood = stats?.pulse ? MOOD_META[stats.pulse.mood] || MOOD_META.quiet : MOOD_META.quiet;

    return h(
        'div',
        { className: 'flex items-center gap-3 p-4' },
        h(
            'div',
            {
                className:
                    'bg-secondary/40 border-border/50 text-accent/80 flex size-10 shrink-0 items-center justify-center rounded-lg border',
            },
            h(Icon, { name: mood.icon, className: 'size-5' }),
        ),
        h(
            'div',
            { className: 'min-w-0 flex-1' },
            h(
                'p',
                { className: 'text-foreground truncate text-sm font-semibold' },
                stats ? `${mood.label} · ${stats.onShiftCount ?? 0} on shift` : 'Shift board',
            ),
            h(
                'p',
                { className: 'text-muted-foreground truncate text-xs' },
                stats ? `${stats.pinCount ?? 0} pins · ${stats.pulse?.joins ?? 0} joins/hr` : 'Loading…',
            ),
        ),
    );
}

export const pages = { StarterPage };
export const widgets = { StarterWidget };
export default { pages, widgets };
