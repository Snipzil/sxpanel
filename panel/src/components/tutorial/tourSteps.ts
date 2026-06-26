export type TourStep = {
    title: string;
    description: string;
    /** `null` = centered wrap-up step with no spotlight target */
    targetSelector: string | null;
};

export const POST_INSTALL_TOUR_STEPS: TourStep[] = [
    {
        title: 'Settings',
        description: 'Configure FXServer, Discord bot, bans, whitelist, and gameplay defaults from one place.',
        targetSelector: 'a[href="/settings"]',
    },
    {
        title: 'Admin Manager',
        description: 'Invite admins and manage permission presets for your team.',
        targetSelector: 'a[href="/admins"]',
    },
    {
        title: 'Players',
        description: 'Search players, issue bans or warns, and review history at a glance.',
        targetSelector: 'a[href="/players"]',
    },
    {
        title: 'History',
        description: 'Audit every action taken across the panel — bans, warns, kicks, more.',
        targetSelector: 'a[href="/history"]',
    },
    {
        title: 'Live Console',
        description: 'Send commands and watch FXServer output in real time.',
        targetSelector: 'a[href="/server/console"]',
    },
    {
        title: 'Diagnostics',
        description: 'Check host health and export a support diagnostics report.',
        targetSelector: 'a[href="/system/diagnostics"]',
    },
    {
        title: 'Resources',
        description: 'Start, stop, and manage the resources running on your server.',
        targetSelector: 'a[href="/server/resources"]',
    },
    {
        title: "You're set",
        description: "That's the quick tour. You can revisit any of these from the left sidebar — happy moderating!",
        targetSelector: null,
    },
];
