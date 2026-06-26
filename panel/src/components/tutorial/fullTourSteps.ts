/**
 * Full guided tour: navigates real pages, highlights individual widgets and
 * controls per page, and (when available) opts into the existing dev-mock
 * data flag so first-run users see representative numbers instead of
 * empty/zeroed dashboards.
 *
 * Each step targets a single element so the user gets element-by-element
 * narration ("here's the player drops chart" → "here's the perf chart" → next page).
 *
 * `route` + optional `hash` are applied via wouter / location hash; the host
 * waits for the resolver to find a usable element before scrolling +
 * measuring (with a soft timeout so a missing target doesn't deadlock).
 *
 * `setup` runs each time a step becomes active (e.g., open a dialog or click
 * a tab so the highlighted element is actually mounted). `teardown` runs when
 * the user moves away from that step (e.g., close the dialog before navigating).
 */
export type FullTourTargetSpec = string | (() => HTMLElement | null) | null;

export type FullTourPreferredSide = 'east' | 'west' | 'south' | 'north';

export type FullTourStep = {
    /** Route the host should navigate to before measuring this step. `null` = stay on current page. */
    route: string | null;
    /** Optional URL hash applied after navigation (Settings tabs use this). */
    hash?: string;
    /** CSS selector or resolver function. `null` = centered card with no spotlight. */
    target: FullTourTargetSpec;
    title: string;
    description: string;
    /** Soft deadline (ms) to wait for the target after navigating. Defaults to 1500. */
    awaitTargetMs?: number;
    /** Bias the tooltip placement to a specific side; falls back to auto-fit. */
    preferredSide?: FullTourPreferredSide;
    /** Set when the target is intentionally page-wide (tablists, headers spanning many tabs). */
    fullWidthTarget?: boolean;
    /**
     * Override the default tooltip card width (~360px). Use a smaller value (e.g. 280)
     * for steps where the card sits beside a centered modal and only has a
     * narrow vertical slot to live in; the description will wrap onto more lines.
     */
    cardWidth?: number;
    /** Imperative action run when the step becomes active (e.g. open a dialog, click a tab). */
    setup?: () => void;
    /** Imperative cleanup run when leaving the step (e.g. close a dialog before navigating). */
    teardown?: () => void;
};

/**
 * Walks an element up to N ancestors. Used so a chart's `<h3>` title resolves
 * to the surrounding card box (which is what we actually want to highlight).
 */
const up = (el: HTMLElement | null | undefined, levels: number): HTMLElement | null => {
    let cur: HTMLElement | null = el ?? null;
    for (let i = 0; i < levels && cur; i++) {
        cur = cur.parentElement;
    }
    return cur;
};

/**
 * Find an element by tag + a substring of its text content (case-insensitive).
 * Useful for tags rendered with class-name salads where there's no stable selector.
 */
const findByText = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    needle: string,
    container: ParentNode = document,
): HTMLElementTagNameMap[K] | null => {
    const lower = needle.toLowerCase();
    const nodes = container.querySelectorAll(tag);
    for (const node of Array.from(nodes)) {
        if ((node.textContent ?? '').toLowerCase().includes(lower)) {
            return node as HTMLElementTagNameMap[K];
        }
    }
    return null;
};

/** Resolve a Radix tab trigger (`[role="tab"]`) by its visible label. */
const findTabByLabel = (label: string): HTMLElement | null =>
    findByText('button', label, document.querySelector('[role="tablist"]') ?? document);

const findCardByH3 = (textIncludes: string): HTMLElement | null => {
    const h3 = findByText('h3', textIncludes);
    return up(h3, 3);
};

/** Click a Settings tab. Used as `setup` so the tab body actually mounts before we move on. */
const clickSettingsTab = (label: string) => {
    const btn = findTabByLabel(label);
    btn?.click();
};

/** Click the in-page tab with the given label inside an Admins / Players-style page. */
const clickPageTab = (label: string) => {
    const tablist = document.querySelector('[role="tablist"]');
    const btn = findByText('button', label, tablist ?? document);
    btn?.click();
};

/** Click the first dialog-trigger button matching a label. */
const clickButtonByText = (label: string) => {
    const btn = findByText('button', label);
    btn?.click();
};

/**
 * Find the topmost APP modal (admin edit, player modal, etc.) — explicitly
 * excludes the tour's own tooltip card, the welcome host, and Radix Sheets
 * (mobile global menu / players sidebar), all of which can also expose
 * `role="dialog"` and would otherwise be matched first.
 *
 * Strategy:
 * - Filter on `[data-state="open"]` so closed-but-still-mounted Radix elements are skipped.
 * - Walk in reverse mount order so the most recently opened modal wins.
 * - Skip anything inside the tour overlay container.
 * - Skip welcome / future tour dialogs by their `fxpanel-` id or aria-labelledby.
 * - Skip slide-in Sheets (their content has `data-state="open"` but uses
 *   `inset-y-0` positioning that hugs the viewport edge).
 */
const findAppDialog = (): HTMLElement | null => {
    const tourOverlay = document.getElementById('fxpanel-post-install-tour-overlay');
    const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]'));
    for (let i = dialogs.length - 1; i >= 0; i--) {
        const d = dialogs[i];
        if (tourOverlay && tourOverlay.contains(d)) continue;
        if (d.id?.startsWith('fxpanel-')) continue;
        const labelledBy = d.getAttribute('aria-labelledby');
        if (labelledBy && labelledBy.startsWith('fxpanel-')) continue;
        // Sheets (mobile menu / players sidebar) hug a viewport edge; centered
        // app dialogs don't. Detect by class signature.
        const className = d.className || '';
        if (
            className.includes('inset-y-0') ||
            className.includes('inset-x-0') ||
            className.includes('slide-in-from-left') ||
            className.includes('slide-in-from-right') ||
            className.includes('slide-in-from-top') ||
            className.includes('slide-in-from-bottom')
        ) {
            continue;
        }
        return d;
    }
    return null;
};

/** Close the topmost APP dialog by clicking its close button. Never dispatches a global Escape (would self-cancel the tour). */
const dismissOpenDialog = () => {
    const dialog = findAppDialog();
    if (!dialog) return;
    const closeBtn = dialog.querySelector<HTMLElement>('button[aria-label="Close"], [data-radix-dialog-close]');
    closeBtn?.click();
};

/** Click the first eligible row in the History table to open the player profile modal. */
const openFirstHistoryRowProfile = () => {
    const cells = document.querySelectorAll<HTMLElement>(
        'table tbody tr td button, table tbody tr td a, table tbody tr td [role="button"]',
    );
    if (cells.length > 0) {
        cells[0].click();
        return;
    }
    const row = document.querySelector<HTMLElement>('table tbody tr');
    row?.click();
};

export const FULL_INSTALL_TOUR_STEPS: FullTourStep[] = [
    //#region Intro
    {
        route: '/',
        target: null,
        title: "Let's take the full tour",
        description:
            "We'll walk through every major page and highlight the widgets you'll use day-to-day. Use Continue / Back, or arrow keys, to move through. Press Esc any time to exit.",
    },

    //#region Dashboard — page-level intro then individual cards
    {
        route: '/',
        target: 'h1',
        title: 'Dashboard',
        description:
            'Your home base. Real-time server status, player count, performance, and recent disconnects all live here.',
        preferredSide: 'south',
    },
    {
        route: '/',
        target: () => findCardByH3('Player Drops'),
        title: 'Player Drops chart',
        description:
            'Pie chart of why players have disconnected in the last 6 hours — crashes, timeouts, kicks, manual exits. Hover any wedge to see counts; click a legend chip to filter.',
        awaitTargetMs: 2500,
    },
    {
        route: '/',
        target: () => findCardByH3('Server Stats'),
        title: 'Server Stats',
        description:
            'Uptime percentage, median player count, and live FXServer + Node.js memory usage. A glance here tells you whether the host is healthy.',
        awaitTargetMs: 1800,
    },
    {
        route: '/',
        target: () => findCardByH3('Performance') ?? findCardByH3('Server Performance'),
        title: 'Thread performance',
        description:
            'Histogram of how long each tick takes on the selected server thread. Greens are fast, reds are slow. Switch threads with the dropdown to see if a specific resource is dragging.',
        awaitTargetMs: 1800,
    },
    {
        route: '/',
        target: () => findCardByH3('Server Performance'),
        title: 'Server Performance over time',
        description:
            'The full perf chart shows tick durations across the last few hours. Toggle Players, FXServer memory, or Node memory overlays to correlate spikes with load.',
        awaitTargetMs: 1800,
    },

    //#region Settings — header + every tab
    {
        route: '/settings',
        target: 'h1',
        title: 'Settings',
        description:
            'All FXServer, Discord, ban, whitelist, and gameplay configuration lives here. Changes are staged in the panel and only saved when you click Save on a card.',
        preferredSide: 'south',
    },
    {
        route: '/settings',
        target: '[role="tablist"]',
        title: 'Settings tabs',
        description:
            "Settings are grouped into tabs. We'll walk through every one so you know where each option lives.",
        awaitTargetMs: 1200,
        preferredSide: 'south',
        fullWidthTarget: true,
    },
    {
        route: '/settings',
        hash: 'general',
        target: () => findTabByLabel('General'),
        title: 'General',
        description: 'Server name, language, and the txAdmin-side basics. The first place to brand your server.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('General'),
    },
    {
        route: '/settings',
        hash: 'fxserver',
        target: () => findTabByLabel('FXServer'),
        title: 'FXServer',
        description:
            'Server data path, runtime arguments, and CFG location. Where you go when something is wrong with how the server starts.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('FXServer'),
    },
    {
        route: '/settings',
        hash: 'bans',
        target: () => findTabByLabel('Bans'),
        title: 'Bans',
        description:
            'Default ban duration, ban templates, and reject messages. Templates let admins ban with one click instead of typing reasons.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('Bans'),
    },
    {
        route: '/settings',
        hash: 'whitelist',
        target: () => findTabByLabel('Whitelist'),
        title: 'Whitelist',
        description:
            'Whitelist mode, request settings, and Discord-role gating. Useful if you want to vet players before they join.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('Whitelist'),
    },
    {
        route: '/settings',
        hash: 'discord',
        target: () => findTabByLabel('Discord'),
        title: 'Discord integration',
        description:
            'Bot token, OAuth, and log routes. The bot drives in-game admin notifications, log streaming, and Discord-side moderation.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('Discord'),
    },
    {
        route: '/settings',
        hash: 'game',
        target: () => findTabByLabel('Game'),
        title: 'Game',
        description:
            'In-game admin menu, notifications, and report channel. This is what your admins see when they press F1 in-game.',
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('Game'),
    },
    {
        route: '/settings',
        hash: 'player-tags',
        target: () => findTabByLabel('Player Tags'),
        title: 'Player Tags',
        description:
            "Define color-coded tags admins can attach to players (e.g. 'VIP', 'troublemaker', 'verified'). Tags show on the players list and player profiles.",
        awaitTargetMs: 1200,
        preferredSide: 'south',
        setup: () => clickSettingsTab('Player Tags'),
    },

    //#region Admins — header, add-admin dialog, presets tab
    {
        route: '/admins',
        target: 'h1',
        title: 'Admin Manager',
        description:
            'Add per-admin accounts, scope their permissions, and manage your staff roster. Master accounts can do everything; regular admins are scoped per action.',
        preferredSide: 'south',
    },
    {
        route: '/admins',
        target: findAppDialog,
        title: 'New admin form',
        description:
            "This is what opens when you click 'Add Admin'. Each admin needs a username, an optional FiveM/CitizenFX ID, an optional Discord ID, and a permission set built from the presets. Identities let admins sign in with their FiveM or Discord account.",
        awaitTargetMs: 2000,
        preferredSide: 'west',
        cardWidth: 280,
        setup: () => clickButtonByText('Add Admin'),
        teardown: dismissOpenDialog,
    },
    {
        route: '/admins',
        target: () => findByText('button', 'Permission Presets'),
        title: 'Permission Presets',
        description:
            "Reusable bundles of permissions you can apply to any admin in one click. Build a 'Moderator' or 'Senior Admin' preset once and assign it instead of ticking permissions per-account.",
        awaitTargetMs: 1500,
        preferredSide: 'south',
        setup: () => clickPageTab('Permission Presets'),
    },

    //#region Players — header, search box, table, and a real player profile
    {
        route: '/players',
        target: 'h1',
        title: 'Players',
        description:
            'Search every player who has connected. Issue bans, warns, or whitelists, and open the full player profile from any row to see history, identifiers, and notes.',
        preferredSide: 'south',
    },
    {
        route: '/players',
        target: () => {
            const input = document.querySelector<HTMLInputElement>(
                'input[placeholder*="player" i], input[placeholder*="License" i], input[placeholder*="note" i]',
            );
            return up(input as HTMLElement | null, 3);
        },
        title: 'Player search',
        description:
            "Type a name, license, or Discord ID. Results stream live and respect your admin permissions. Use 'Search by' to change which column you search and 'No filters' to narrow by online / banned / whitelisted state.",
        awaitTargetMs: 2000,
    },
    {
        route: '/players',
        target: 'table, [role="table"]',
        title: 'Players table',
        description:
            'Every connection on record. Click any row to open the full player profile — sessions, identifiers, ban/warn history, and notes. Right-click for quick actions.',
        awaitTargetMs: 2000,
        preferredSide: 'north',
    },

    //#region History — header, callouts, and a real action row
    {
        route: '/history',
        target: 'h1',
        title: 'History',
        description:
            'Audit every moderation action: bans, warns, kicks, whitelist changes. Filter by admin, player, or action type to investigate incidents.',
        preferredSide: 'south',
    },
    {
        route: '/history',
        target: () => document.querySelector<HTMLElement>('table tbody tr'),
        title: 'Action row',
        description:
            "Each row is one moderation action. Click a row to open the player's full profile and see the action in context. Use the search and filters above to find specific incidents.",
        awaitTargetMs: 2500,
        preferredSide: 'north',
    },
    {
        route: '/history',
        target: findAppDialog,
        title: 'Player profile',
        description:
            'This is the player profile that opens from any history row. Bans/warns, identifiers, sessions, notes, and quick actions all live here. The same modal opens from the Players page and from the in-game admin menu.',
        awaitTargetMs: 2500,
        preferredSide: 'west',
        cardWidth: 280,
        setup: openFirstHistoryRowProfile,
        teardown: dismissOpenDialog,
    },

    //#region Live Console
    {
        route: '/server/console',
        target: 'h1',
        title: 'Live Console',
        description:
            'Stream FXServer output in real time. Send commands when you need to interact with the server outside of the in-game admin menu.',
        preferredSide: 'south',
    },

    //#region Resources
    {
        route: '/server/resources',
        target: 'h1',
        title: 'Resources',
        description:
            'Start, stop, restart, and refresh the resources installed on your server. Useful when iterating on a script without touching the console.',
        preferredSide: 'south',
    },

    //#region Diagnostics
    {
        route: '/system/diagnostics',
        target: 'h1',
        title: 'Diagnostics',
        description:
            "Host health, memory pressure, network info, and a one-click support report. If something feels off, this page is where you'll start.",
        preferredSide: 'south',
    },

    //#region Wrap up
    {
        route: '/',
        target: null,
        title: "You're all set",
        description: "That's the full tour. Happy moderating.",
    },
];
