import { createContext, use, useState } from 'react';
import { cn } from '@/lib/utils';
import PlayerlistSummary from './PlayerlistSummary';
import Playerlist from './Playerlist';

const LOCALSTORAGE_KEY = 'playerlist-collapsed';

const PlayerlistCollapsedCtx = createContext(false);
export const usePlayerlistCollapsed = () => use(PlayerlistCollapsedCtx);

type PlayerSidebarProps = {
    isSheet?: boolean;
};
export function PlayerlistSidebar({ isSheet }: PlayerSidebarProps) {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            return localStorage.getItem(LOCALSTORAGE_KEY) === 'true';
        } catch {
            return false;
        }
    });

    const toggleCollapsed = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(LOCALSTORAGE_KEY, String(next));
            } catch {}
            return next;
        });
    };

    // The mobile sheet is always fully expanded, regardless of the desktop collapse preference
    const isCollapsed = !isSheet && collapsed;

    return (
        <PlayerlistCollapsedCtx.Provider value={isCollapsed}>
            <aside
                className={cn(
                    'z-10 flex-col',
                    isSheet
                        ? 'flex h-screen w-full'
                        : cn(
                              'tx-sidebar h-contentvh shell-lg:flex hidden',
                              'bg-card text-card-foreground border-border/60 rounded-2xl border shadow-sm',
                              isCollapsed ? 'w-(--tx-playerlist-collapsed-width)' : 'w-(--tx-playerlist-width)',
                          ),
                )}
            >
                <div
                    className={cn(
                        'shrink-0',
                        isSheet ? 'border-b p-4 pr-12' : 'border-border/40 border-b px-3 py-2.5',
                        isCollapsed && 'border-b-0 px-2',
                    )}
                >
                    <PlayerlistSummary onToggleCollapsed={isSheet ? undefined : toggleCollapsed} />
                </div>
                {!isCollapsed && (
                    <div className="flex min-h-0 flex-1 grow flex-col gap-2 overflow-hidden pb-1">
                        <Playerlist />
                    </div>
                )}
            </aside>
        </PlayerlistCollapsedCtx.Provider>
    );
}
