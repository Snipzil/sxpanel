import { useAtom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import type { LiveConsoleOptions } from '@/pages/LiveConsole/LiveConsolePage';

/**
 * Custom storage adapter for LiveConsoleOptions
 * Maps between the LiveConsoleOptions shape and the two legacy localStorage keys
 */
const liveConsoleOptionsStorage = createJSONStorage<LiveConsoleOptions>(() => ({
    getItem: (key: string) => {
        try {
            const raw = localStorage.getItem(key);
            if (raw) return raw;

            // Legacy key migration path.
            let timestampDisabled = false;
            let timestampForceHour12: boolean | undefined = undefined;
            let copyTimestamp = false;
            let copyTag = true;

            const tsConfig = localStorage.getItem('liveConsoleTimestamp');
            if (tsConfig === '24h') {
                timestampForceHour12 = false;
            } else if (tsConfig === '12h') {
                timestampForceHour12 = true;
            } else if (tsConfig === 'off') {
                timestampDisabled = true;
            }

            const copyConfig = localStorage.getItem('liveConsoleCopyOpts');
            if (typeof copyConfig === 'string') {
                const parts = copyConfig.split(',');
                copyTimestamp = parts.includes('ts');
                copyTag = parts.includes('tag');
            }

            return JSON.stringify({ timestampDisabled, timestampForceHour12, copyTimestamp, copyTag });
        } catch {
            return null;
        }
    },
    setItem: (key: string, newValue: string) => {
        try {
            localStorage.setItem(key, newValue);
            const parsed = JSON.parse(newValue) as LiveConsoleOptions;
            if (parsed.timestampDisabled) {
                localStorage.setItem('liveConsoleTimestamp', 'off');
            } else if (parsed.timestampForceHour12 === true) {
                localStorage.setItem('liveConsoleTimestamp', '12h');
            } else if (parsed.timestampForceHour12 === false) {
                localStorage.setItem('liveConsoleTimestamp', '24h');
            } else {
                localStorage.removeItem('liveConsoleTimestamp');
            }
            const copyParts: string[] = [];
            if (parsed.copyTimestamp) copyParts.push('ts');
            if (parsed.copyTag) copyParts.push('tag');
            localStorage.setItem('liveConsoleCopyOpts', copyParts.join(','));
        } catch {}
    },
    removeItem: (key: string) => {
        try {
            localStorage.removeItem(key);
            localStorage.removeItem('liveConsoleTimestamp');
            localStorage.removeItem('liveConsoleCopyOpts');
        } catch {}
    },
}));

const defaultConsoleOptions: LiveConsoleOptions = {
    timestampDisabled: false,
    timestampForceHour12: undefined,
    copyTimestamp: false,
    copyTag: true,
};

export const liveConsoleOptionsAtom = atomWithStorage<LiveConsoleOptions>(
    'liveConsoleOptions', // key (not used by our custom storage, but required by the API)
    defaultConsoleOptions,
    liveConsoleOptionsStorage,
);

/**
 * Atoms
 */
const liveConsoleHistoryAtom = atomWithStorage<string[]>('liveConsoleCommandHistory', []);
const liveConsoleBookmarksAtom = atomWithStorage<string[]>('liveConsoleCommandBookmarks', []);
const historyMaxLength = 50;

/**
 * Hooks
 */
export const useLiveConsoleHistory = () => {
    const [history, setHistory] = useAtom(liveConsoleHistoryAtom);
    return {
        history,
        setHistory,
        appendHistory: (cmd: string) => {
            const newHistory = history.filter((h) => h !== cmd);
            if (newHistory.unshift(cmd) > historyMaxLength) newHistory.pop();
            setHistory(newHistory);
        },
        wipeHistory: () => {
            setHistory([]);
        },
    };
};

export const useLiveConsoleBookmarks = () => {
    const [bookmarks, setBookmarks] = useAtom(liveConsoleBookmarksAtom);
    return {
        bookmarks,
        addBookmark: (cmd: string) => {
            if (!bookmarks.includes(cmd)) {
                setBookmarks([cmd, ...bookmarks]);
            }
        },
        removeBookmark: (cmd: string) => {
            setBookmarks(bookmarks.filter((b) => b !== cmd));
        },
    };
};
