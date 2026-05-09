import { useMemo } from 'react';
import { numberToLocaleString } from '@/lib/utils';
import { PlayerDropsMessage } from './PlayerDropsGenericSubcards';
import { playerDropCategories } from '@/lib/playerDropCategories';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ClockIcon } from 'lucide-react';

const formatSessionTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

type DisplayCategoryDatum = {
    label: string;
    tooltip: string;
    color: string;
    count: number;
};

type DrilldownOverviewSubcardProps = {
    dropTypes: [string, number][];
    avgSessionSeconds: number | null;
};

export default function DrilldownOverviewSubcard({ dropTypes, avgSessionSeconds }: DrilldownOverviewSubcardProps) {
    let { totalDrops, categories } = useMemo(() => {
        let totalDrops = 0;
        const categories: Record<string, DisplayCategoryDatum> = {};
        for (const [cat, cnt] of dropTypes) {
            totalDrops += cnt;
            if (!(cat in playerDropCategories)) continue;
            categories[cat] = {
                label: playerDropCategories[cat].label,
                tooltip: playerDropCategories[cat].description,
                color: playerDropCategories[cat].color,
                count: cnt,
            };
        }
        return {
            totalDrops,
            categories: Object.entries(categories),
        };
    }, [dropTypes]);

    if (!categories.length) {
        return <PlayerDropsMessage message="No player drops within this time window." />;
    }

    return (
        <div className="text-muted-foreground flex flex-col gap-4">
            <div className="flex flex-wrap justify-evenly gap-4">
                {categories.map(([reasonId, reasonData]) => (
                    <Tooltip key={reasonId}>
                        <TooltipTrigger asChild>
                            <div className="bg-secondary/20 border-border/40 flex flex-col items-center justify-center gap-1 rounded-lg border px-5 py-3">
                                <span
                                    className="border-b-2 text-lg font-semibold tracking-wider"
                                    style={{ borderColor: reasonData.color }}
                                >
                                    {reasonData.label}
                                </span>
                                <span className="text-sm">
                                    {numberToLocaleString(reasonData.count)}{' '}
                                    <small className="text-muted-foreground/60">
                                        ({numberToLocaleString((reasonData.count / totalDrops) * 100, 1)}%)
                                    </small>
                                </span>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-96 text-center">
                            <p>{reasonData.tooltip}</p>
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
            {avgSessionSeconds !== null && (
                <div className="border-border/40 flex items-center justify-center gap-2 border-t pt-3 text-sm">
                    <ClockIcon className="size-4 opacity-75" />
                    <span>
                        Average session time at disconnect:{' '}
                        <span className="font-semibold">{formatSessionTime(avgSessionSeconds)}</span>
                    </span>
                </div>
            )}
        </div>
    );
}
