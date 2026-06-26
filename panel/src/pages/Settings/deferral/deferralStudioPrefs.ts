const STORAGE_KEY = 'fxpanel.deferralStudio.prefs';

export type DeferralStudioPrefs = {
    showGrid: boolean;
    snapToGrid: boolean;
};

export const DEFAULT_DEFERRAL_STUDIO_PREFS: DeferralStudioPrefs = {
    showGrid: false,
    snapToGrid: true,
};

/** Loads deferral studio grid/snap preferences from localStorage. */
export function loadDeferralStudioPrefs(): DeferralStudioPrefs {
    if (typeof window === 'undefined') return DEFAULT_DEFERRAL_STUDIO_PREFS;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_DEFERRAL_STUDIO_PREFS;
        const parsed = JSON.parse(raw) as Partial<DeferralStudioPrefs>;
        return {
            showGrid: parsed.showGrid ?? DEFAULT_DEFERRAL_STUDIO_PREFS.showGrid,
            snapToGrid: parsed.snapToGrid ?? DEFAULT_DEFERRAL_STUDIO_PREFS.snapToGrid,
        };
    } catch {
        return DEFAULT_DEFERRAL_STUDIO_PREFS;
    }
}

/** Persists deferral studio grid/snap preferences. */
export function saveDeferralStudioPrefs(prefs: DeferralStudioPrefs): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        /* ignore quota / private mode */
    }
}
