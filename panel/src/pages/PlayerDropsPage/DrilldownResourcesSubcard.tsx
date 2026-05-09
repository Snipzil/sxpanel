import { useMemo } from 'react';
import { numberToLocaleString } from '@/lib/utils';
import { PlayerDropsMessage } from './PlayerDropsGenericSubcards';

type DisplayResourceDatum = {
    label: string;
    count: number;
};

type DrilldownResourcesSubcardProps = {
    resKicks: [string, number][];
};

export default function DrilldownResourcesSubcard({ resKicks }: DrilldownResourcesSubcardProps) {
    let { totalKicks, resources } = useMemo(() => {
        let totalKicks = 0;
        const resources: Record<string, DisplayResourceDatum> = {};
        for (const [resName, cnt] of resKicks) {
            totalKicks += cnt;
            resources[resName] = {
                label: resName,
                count: cnt,
            };
        }
        return {
            totalKicks,
            resources: Object.entries(resources),
        };
    }, [resKicks]);

    if (!resources.length) {
        return <PlayerDropsMessage message="No players kicked by resources within this time window." />;
    }

    return (
        <div className="text-muted-foreground flex flex-wrap justify-evenly gap-3">
            {resources.map(([resName, resData]) => (
                <div
                    key={resName}
                    className="bg-secondary/20 border-border/40 flex flex-col items-center justify-center gap-1 rounded-lg border px-5 py-3"
                >
                    <span className="font-mono text-sm font-medium">{resData.label}</span>
                    <span className="text-xs">
                        {numberToLocaleString(resData.count)}{' '}
                        <small className="text-muted-foreground/60">
                            ({numberToLocaleString((resData.count / totalKicks) * 100, 1)}%)
                        </small>
                    </span>
                </div>
            ))}
        </div>
    );
}
