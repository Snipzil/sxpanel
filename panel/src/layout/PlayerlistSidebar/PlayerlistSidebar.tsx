import { cn } from '@/lib/utils';
import { useShellBreakpoints } from '@/hooks/useShellBreakpoints';
import PlayerlistSummary from './PlayerlistSummary';
import Playerlist from './Playerlist';

type PlayerSidebarProps = {
    isSheet?: boolean;
};
export function PlayerlistSidebar({ isSheet }: PlayerSidebarProps) {
        const { isXl } = useShellBreakpoints();

    return (
        <aside
            className={cn(
                'z-10 flex-col',
                isSheet
                    ? 'flex h-screen w-full'
                                        : isXl
                                            ? // Only show inline on xl+; on narrower viewports the mobile
                                                // header's Players button opens it as a sheet instead.
                                                'tx-sidebar h-contentvh flex gap-4'
                                            : 'hidden',
            )}
        >
            <div
                className={cn(
                    'text-card-foreground shrink-0 p-4',
                    isSheet ? 'border-b pr-12' : 'bg-card rounded-xl border',
                )}
            >
                <PlayerlistSummary />
            </div>
            <div
                className={cn(
                    'flex grow flex-col gap-2 overflow-hidden',
                    !isSheet && 'bg-card text-card-foreground min-h-[480px] rounded-xl border shadow-xs',
                )}
            >
                <Playerlist />
            </div>
        </aside>
    );
}
