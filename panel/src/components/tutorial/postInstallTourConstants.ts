export const POST_INSTALL_TOUR_PENDING_KEY = 'sxpanel.postInstallTour.pending';
export const POST_INSTALL_TOUR_DISMISSED_KEY = 'sxpanel.postInstallTour.dismissed';
export const POST_INSTALL_TOUR_REPLAY_EVENT = 'sxpanel-post-install-tour-replay';

/** User dismissed the dashboard welcome card (any of Skip / Basic / Full entry). */
export const POST_INSTALL_WELCOME_DISMISSED_KEY = 'sxpanel.postInstallWelcome.dismissed';

/** Full guided tour (multi-page, mock data) — set when user chooses it; cleared when tour ends or is dismissed. */
export const POST_INSTALL_FULL_TOUR_PENDING_KEY = 'sxpanel.postInstallFullTour.pending';
export const POST_INSTALL_FULL_TOUR_DISMISSED_KEY = 'sxpanel.postInstallFullTour.dismissed';

/** Fired after welcome / tour / full-tour localStorage keys change so mounted hosts re-evaluate flags. */
export const POST_INSTALL_FLOW_CHANGED_EVENT = 'sxpanel-post-install-flow-changed';

export function notifyPostInstallFlowChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(POST_INSTALL_FLOW_CHANGED_EVENT));
}
