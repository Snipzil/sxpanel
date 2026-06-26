import { Fragment, useMemo } from 'react';
import { PlayerDropsMessage } from './PlayerDropsGenericSubcards';
import type { PDLChangeEventType } from '@shared/otherTypes';
import { processResourceChanges } from './utils';
import { cn } from '@/lib/utils';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';

function DiffOld({ children }: { children: React.ReactNode }) {
    return <span className="text-background bg-destructive-inline/90 px-1 font-mono text-sm">{children}</span>;
}
function DiffNew({ children }: { children: React.ReactNode }) {
    return <span className="text-background bg-success-inline/90 px-1 font-mono text-sm">{children}</span>;
}
function DiffUpdated({ children }: { children: React.ReactNode }) {
    return <span className="text-background bg-warning/90 px-1 font-mono text-sm">{children}</span>;
}

type ChangedFxsEventProps = { change: Extract<PDLChangeEventType, { type: 'fxsChanged' }> };
function ChangedFxsEvent({ change }: ChangedFxsEventProps) {
    return (
        <>
            Switched from <DiffOld>{change.oldVersion}</DiffOld> to <DiffNew>{change.newVersion}</DiffNew>
        </>
    );
}

type ChangedGameEventProps = { change: Extract<PDLChangeEventType, { type: 'gameChanged' }> };
function ChangedGameEvent({ change }: ChangedGameEventProps) {
    return (
        <>
            Switched from <DiffOld>{change.oldVersion}</DiffOld> to <DiffNew>{change.newVersion}</DiffNew>
        </>
    );
}

type ChangedResourcesEventProps = { change: Extract<PDLChangeEventType, { type: 'resourcesChanged' }> };
function ChangedResourcesEvent({ change }: ChangedResourcesEventProps) {
    const processedChanges = useMemo(() => {
        return processResourceChanges(change.resRemoved, change.resAdded);
    }, [change.resRemoved, change.resAdded]);

    let removedNode = null;
    if (processedChanges.removed.length) {
        removedNode = (
            <p>
                Removed:{' '}
                {processedChanges.removed.map((item, index, array) => (
                    <Fragment key={item}>
                        <DiffOld>{item}</DiffOld>
                        {index < array.length - 1 ? ', ' : '.'}
                    </Fragment>
                ))}
            </p>
        );
    }

    let addedNode = null;
    if (processedChanges.added.length) {
        addedNode = (
            <p>
                Added:{' '}
                {processedChanges.added.map((item, index, array) => (
                    <Fragment key={item}>
                        <DiffNew>{item}</DiffNew>
                        {index < array.length - 1 ? ', ' : '.'}
                    </Fragment>
                ))}
            </p>
        );
    }

    let updatedNode = null;
    if (processedChanges.updated.length) {
        updatedNode = (
            <p>
                Updated:{' '}
                {processedChanges.updated.map((item, index, array) => (
                    <Fragment key={`${item.resName}:${item.oldVer}:${item.newVer}`}>
                        <DiffUpdated>
                            {item.resName} {item.oldVer} -&gt; {item.newVer}
                        </DiffUpdated>
                        {index < array.length - 1 ? ', ' : '.'}
                    </Fragment>
                ))}
            </p>
        );
    }

    return (
        <>
            {removedNode}
            {addedNode}
            {updatedNode}
        </>
    );
}

type DrilldownChangesSubcardProps = {
    changes: PDLChangeEventType[];
};

export default function DrilldownChangesSubcard({ changes }: DrilldownChangesSubcardProps) {
    const eventTitles: Record<string, string> = {
        fxsChanged: 'Changed FXServer version',
        gameChanged: 'Changed game version',
        resourcesChanged: 'Changed boot resources',
    };

    const sortedChanges = useMemo(() => {
        return [...changes].sort((a, b) => a.ts - b.ts);
    }, [changes]);

    if (!changes.length) {
        return <PlayerDropsMessage message="No environmental changes within this time window." />;
    }

    return (
        <div className="space-y-3">
            {sortedChanges.map((change) => {
                const changeKey =
                    change.type === 'resourcesChanged'
                        ? `${change.type}:${change.ts}:${change.resRemoved.join('|')}:${change.resAdded.join('|')}`
                        : `${change.type}:${change.ts}:${change.oldVersion}:${change.newVersion}`;

                return (
                    <div
                        key={changeKey}
                        className={cn(
                            'bg-secondary/15 border-border/30 rounded-lg border px-3 py-2.5',
                            'hover:bg-secondary/25 transition-colors',
                        )}
                    >
                        <div className="flex flex-wrap-reverse items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold">
                                {change.type in eventTitles ? eventTitles[change.type] : change.type}
                            </h3>
                            <span className="bg-secondary/40 border-border/40 text-muted-foreground/70 shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium">
                                {tsToLocaleDateTimeString(change.ts, 'medium', 'short')}
                            </span>
                        </div>
                        <div className="text-muted-foreground/80 mt-1 text-sm">
                            {change.type === 'fxsChanged' && <ChangedFxsEvent change={change} />}
                            {change.type === 'gameChanged' && <ChangedGameEvent change={change} />}
                            {change.type === 'resourcesChanged' && <ChangedResourcesEvent change={change} />}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
