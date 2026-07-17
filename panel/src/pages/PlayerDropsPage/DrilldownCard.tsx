import { BoxIcon, FolderOpenIcon, ShapesIcon, SkullIcon } from 'lucide-react';
import { memo, useState } from 'react';
import type { PlayerDropsApiSuccessResp } from '@shared/otherTypes';
import { cn } from '@/lib/utils';
import { dateToLocaleDateString, dateToLocaleTimeString, isDateToday } from '@/lib/dateTime';
import DrilldownCrashesSubcard from './DrilldownCrashesSubcard';
import { PlayerDropsLoadingSpinner } from './PlayerDropsGenericSubcards';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DrilldownChangesSubcard from './DrilldownChangesSubcard';
import DrilldownOverviewSubcard from './DrilldownOverviewSubcard';
import { DisplayLodType, DrilldownRangeSelectionType } from '@/pages/PlayerDropsPage/playerDropsTypes';
import InlineCode from '@/components/InlineCode';
import DrilldownResourcesSubcard from './DrilldownResourcesSubcard';
import { Card, CardContent } from '@/components/ui/card';
import type { ReactNode } from 'react';

function DrilldownSection({
    icon,
    title,
    action,
    children,
    className,
}: {
    icon: ReactNode;
    title: string;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <Card className={cn('bg-background overflow-hidden shadow-none', className)}>
            <div className="border-border/40 flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-secondary/50 text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg [&>svg]:size-4">
                        {icon}
                    </div>
                    <h3 className="text-sm leading-tight font-semibold tracking-tight">{title}</h3>
                </div>
                {action ? (
                    <div className="flex flex-wrap items-center gap-2 pl-12 sm:ml-auto sm:pl-0">{action}</div>
                ) : null}
            </div>
            <CardContent className="p-3 sm:p-4">{children}</CardContent>
        </Card>
    );
}

export function DrilldownCardLoading({ isError }: { isError?: boolean }) {
    return (
        <div className="space-y-4">
            <div className="text-muted-foreground space-x-2 text-center text-sm">
                <span>Loading…</span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DrilldownSection icon={<FolderOpenIcon />} title="Period Overview" className="col-span-full">
                    <PlayerDropsLoadingSpinner isError={isError} />
                </DrilldownSection>
                <DrilldownSection icon={<BoxIcon />} title="Resource Kicks">
                    <PlayerDropsLoadingSpinner isError={isError} />
                </DrilldownSection>
                <DrilldownSection icon={<ShapesIcon />} title="Environment Changes">
                    <PlayerDropsLoadingSpinner isError={isError} />
                </DrilldownSection>
                <DrilldownSection icon={<SkullIcon />} title="Crash Reasons" className="col-span-full">
                    <PlayerDropsLoadingSpinner isError={isError} />
                </DrilldownSection>
            </div>
        </div>
    );
}

type DrilldownCardProps = PlayerDropsApiSuccessResp['detailed'] & {
    rangeSelected: DrilldownRangeSelectionType;
    displayLod: DisplayLodType;
};

const DrilldownCardInner = function DrilldownCard({
    windowStart,
    windowEnd,
    windowData,
    rangeSelected,
    displayLod,
}: DrilldownCardProps) {
    const [crashesTargetLimit, setCrashesTargetLimit] = useState(50);
    const [crashesGroupReasons, setCrashesGroupReasons] = useState(false);

    //Window indicator
    const windowStartDate = new Date(windowStart);
    const windowEndDate = new Date(windowEnd);
    const showDate = !isDateToday(windowStartDate) || !isDateToday(windowEndDate);

    const windowStartTimeStr = dateToLocaleTimeString(windowStartDate, '2-digit', '2-digit');
    const windowStartDateStr = dateToLocaleDateString(windowStartDate, 'short');
    const windowStartStr = showDate ? `${windowStartTimeStr} - ${windowStartDateStr}` : windowStartTimeStr;
    const windowEndTimeStr = dateToLocaleTimeString(windowEndDate, '2-digit', '2-digit');
    const windowEndDateStr = dateToLocaleDateString(windowEndDate, 'short');
    const windowEndStr = showDate ? `${windowEndTimeStr} - ${windowEndDateStr}` : windowEndTimeStr;

    return (
        <div className="space-y-4">
            <div
                className={cn(
                    'text-muted-foreground space-x-2 text-center text-sm',
                    rangeSelected && 'text-primary font-semibold',
                )}
            >
                <span>
                    Period from <InlineCode title={windowStartDate.toISOString()}>{windowStartStr}</InlineCode> to{' '}
                    <InlineCode title={windowEndDate.toISOString()}>{windowEndStr}</InlineCode>.
                </span>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DrilldownSection icon={<FolderOpenIcon />} title="Period Overview" className="col-span-full">
                    <DrilldownOverviewSubcard
                        dropTypes={windowData.dropTypes}
                        avgSessionSeconds={windowData.avgSessionSeconds}
                    />
                </DrilldownSection>

                <DrilldownSection icon={<BoxIcon />} title="Resource Kicks">
                    <DrilldownResourcesSubcard resKicks={windowData.resKicks} />
                </DrilldownSection>

                <DrilldownSection icon={<ShapesIcon />} title="Environment Changes">
                    <DrilldownChangesSubcard changes={windowData.changes} />
                </DrilldownSection>

                <DrilldownSection
                    icon={<SkullIcon />}
                    title="Crash Reasons"
                    className="col-span-full"
                    action={
                        <div className="flex gap-2">
                            <Select
                                value={crashesTargetLimit.toString()}
                                onValueChange={(value) => setCrashesTargetLimit(parseInt(value))}
                            >
                                <SelectTrigger className="h-7 w-32 px-3 py-1 text-xs">
                                    <SelectValue placeholder="Limit" />
                                </SelectTrigger>
                                <SelectContent className="px-0">
                                    <SelectItem value={'50'} className="cursor-pointer">
                                        Top ~50
                                    </SelectItem>
                                    <SelectItem value={'100'} className="cursor-pointer">
                                        Top ~100
                                    </SelectItem>
                                    <SelectItem value={'0'} className="cursor-pointer">
                                        Show All
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            <Select
                                value={crashesGroupReasons.toString()}
                                onValueChange={(value) => setCrashesGroupReasons(value === 'true')}
                            >
                                <SelectTrigger className="h-7 w-36 px-3 py-1 text-xs">
                                    <SelectValue placeholder="Sort" />
                                </SelectTrigger>
                                <SelectContent className="px-0">
                                    <SelectItem value={'false'} className="cursor-pointer">
                                        Sort by Count
                                    </SelectItem>
                                    <SelectItem value={'true'} className="cursor-pointer">
                                        Group Reasons
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    }
                >
                    <DrilldownCrashesSubcard
                        crashTypes={windowData.crashTypes}
                        crashesGroupReasons={crashesGroupReasons}
                        crashesTargetLimit={crashesTargetLimit}
                        setCrashesTargetLimit={setCrashesTargetLimit}
                    />
                </DrilldownSection>
            </div>
        </div>
    );
};

export default memo(DrilldownCardInner);
