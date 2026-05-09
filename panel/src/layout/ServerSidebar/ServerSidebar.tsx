import { cn } from '@/lib/utils';
import { handleExternalLinkClick } from '@/lib/navigation';
import ServerMenu from './ServerMenu';
import ServerControls from './ServerControls';
import ServerStatus from './ServerStatus';
import ServerSchedule from './ServerSchedule';
import { useShellBreakpoints } from '@/hooks/useShellBreakpoints';
import { useAddonWidgets } from '@/hooks/addons';
import { ErrorBoundary } from 'react-error-boundary';

type ServerSidebarProps = {
    isSheet?: boolean;
};
export function ServerSidebar({ isSheet }: ServerSidebarProps) {
    const { isLg } = useShellBreakpoints();
    const statusWidgets = useAddonWidgets('server.status-cards');

    return (
        <aside className={cn('z-10 flex-col gap-4', isSheet ? 'flex px-4 py-6' : isLg ? 'tx-sidebar flex' : 'hidden')}>
            <div className={cn(!isSheet && 'bg-card text-card-foreground rounded-xl border p-4 shadow-xs')}>
                <ServerMenu />
            </div>
            <hr className={isSheet ? 'block' : 'hidden'} />
            <div
                className={cn(
                    !isSheet && 'bg-card text-card-foreground rounded-xl border p-4 shadow-xs',
                    'flex flex-col gap-4',
                )}
            >
                <ServerControls />
                <ServerStatus />
                <ServerSchedule />
            </div>
            {statusWidgets.length > 0 &&
                statusWidgets.map((w) => (
                    <ErrorBoundary
                        key={`${w.addonId}-${w.title}`}
                        fallback={
                            <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-xl border p-3 text-xs">
                                Addon error: {w.title}
                            </div>
                        }
                    >
                        <div className={cn(!isSheet && 'bg-card text-card-foreground rounded-xl border p-4 shadow-xs')}>
                            <w.Component />
                        </div>
                    </ErrorBoundary>
                ))}
            <hr className={isSheet ? 'block' : 'hidden'} />

            {window.txConsts.isWebInterface ? (
                <div className="flex flex-col items-center justify-center gap-1 text-sm font-light opacity-85 hover:opacity-100">
                    <span
                        className={cn(
                            'text-muted-foreground',
                            window.txConsts.txaVersion.includes('-') && 'text-destructive-inline font-semibold',
                        )}
                    >
                        fxP: <strong>v{window.txConsts.txaVersion}</strong>
                        &nbsp;| fxS: <strong>b{window.txConsts.fxsVersion}</strong>
                    </span>
                    <a
                        href="https://github.com/SomeAussieGaymer/fxPanel/blob/main/LICENSE"
                        onClick={handleExternalLinkClick}
                        target="_blank"
                        className="text-muted-foreground hover:text-accent"
                    >
                        &copy; 2026 SomeAussieGamer
                    </a>
                </div>
            ) : null}
        </aside>
    );
}
