import { playerCountAtom } from '@/hooks/playerlist';
import { useAtomValue } from 'jotai';
import { ChevronLeftIcon, ChevronRightIcon, UsersIcon } from 'lucide-react';
import { usePlayerlistCollapsed } from './PlayerlistSidebar';

type PlayerlistSummaryProps = {
    /** Omitted for the mobile sheet, which is always fully expanded. */
    onToggleCollapsed?: () => void;
};

export default function PlayerlistSummary({ onToggleCollapsed }: PlayerlistSummaryProps) {
    const playerCount = useAtomValue(playerCountAtom);
    const playerCountFormatted = playerCount.toLocaleString('en-US');
    const collapsed = usePlayerlistCollapsed();

    if (collapsed) {
        return (
            <div className="flex w-full flex-col items-center gap-2 py-1">
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="text-muted-foreground/60 hover:bg-secondary/40 hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors"
                    title="Expand player list"
                >
                    <ChevronLeftIcon className="size-4" />
                </button>
                <div className="bg-secondary/50 text-muted-foreground flex size-7 items-center justify-center rounded-lg">
                    <UsersIcon className="size-3.5" />
                </div>
                <div className="text-foreground font-mono text-sm font-semibold tabular-nums">
                    {playerCountFormatted}
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full items-center gap-2.5">
            <div className="bg-secondary/50 text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
                <UsersIcon className="size-3.5" />
            </div>
            <span className="text-foreground text-sm font-semibold">Players</span>
            <span className="bg-secondary/50 text-foreground ml-auto rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums">
                {playerCountFormatted}
            </span>
            {onToggleCollapsed && (
                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="text-muted-foreground/50 hover:bg-secondary/40 hover:text-foreground flex size-7 shrink-0 items-center justify-center rounded-md transition-colors"
                    title="Collapse player list"
                >
                    <ChevronRightIcon className="size-4" />
                </button>
            )}
        </div>
    );
}
