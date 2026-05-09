import { CalendarIcon, ChevronRightIcon, SaveIcon, UserIcon } from 'lucide-react';
import { ConfigChangelogEntry } from '@shared/otherTypes';
import { useMemo, useState } from 'react';
import { dateToLocaleDateString, dateToLocaleTimeString, isDateToday, tsToLocaleDateTimeString } from '@/lib/dateTime';
import TxAnchor from '@/components/TxAnchor';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Link } from 'wouter';
import { usePageHeader } from '@/hooks/pages';

//MARK: PageHeaderChangelog
type PageHeaderChangelogProps = {
    changelogData?: ConfigChangelogEntry[];
};
export function PageHeaderChangelog({ changelogData }: PageHeaderChangelogProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const mostRecent = useMemo(() => {
        if (!changelogData?.length) return null;
        const last = changelogData[changelogData.length - 1];
        const lastDate = new Date(last.ts);
        const timeStr = dateToLocaleTimeString(lastDate, '2-digit', '2-digit');
        const dateStr = dateToLocaleDateString(lastDate, 'long');
        const titleTimeIndicator = isDateToday(lastDate) ? timeStr : dateStr;
        return {
            author: last.author,
            dateTime: titleTimeIndicator,
        };
    }, [changelogData]);

    const reversedChangelog = useMemo(() => {
        if (!changelogData) return null;
        return [...changelogData].reverse();
    }, [changelogData]);

    const handleOpenChangelog = () => {
        setIsModalOpen(true);
    };

    const placeholder = Array.isArray(changelogData) ? 'No changes yet' : 'loading...';

    return (
        <>
            <div className="xs:flex-col max-xs:items-center max-xs:gap-2 max-xs:w-full text-muted-foreground group relative flex rounded-lg px-2 py-1">
                {reversedChangelog?.length ? (
                    <div
                        className="bg-card text-primary group-active:bg-primary group-active:text-primary-foreground absolute inset-0 flex cursor-pointer items-center justify-center rounded-[inherit] border opacity-0 transition-opacity select-none group-hover:opacity-100 group-active:border-none"
                        onClick={handleOpenChangelog}
                    >
                        View Changelog
                    </div>
                ) : null}
                <div className="leading-3 font-semibold tracking-wider">
                    <SaveIcon className="max-xs:hidden inline-block size-4 align-text-bottom" /> Last Updated
                    <span className="xs:hidden">:</span>
                </div>
                <div className="text-xs">
                    <CalendarIcon className="inline-block size-4 align-text-bottom" />{' '}
                    {mostRecent?.dateTime ?? placeholder}
                </div>
                {/* <div className='text-xs'>
                <UserIcon className='size-4 inline-block align-text-bottom' /> {mostRecent?.author ?? placeholder}
            </div> */}
            </div>
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-xl max-sm:p-4">
                    <DialogHeader>
                        <DialogTitle>Recent Changes</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[80vh] space-y-3 overflow-auto pr-3" style={{ scrollbarWidth: 'thin' }}>
                        {reversedChangelog?.map((entry, i) => (
                            <ChangelogEntry key={`${entry.ts}-${entry.author}-${i}`} entry={entry} />
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function ChangelogEntry({ entry }: { entry: ConfigChangelogEntry }) {
    return (
        <div className="odd:bg-card/75 flex flex-col gap-2 rounded-md border px-3 py-2">
            <div className="flex items-center justify-between">
                <div className="text-accent font-semibold">
                    <UserIcon className="mr-2 inline-block size-5 align-text-bottom opacity-65" />
                    {entry.author}
                </div>
                <div className="text-muted-foreground text-sm">
                    {tsToLocaleDateTimeString(entry.ts, 'short', 'short')}
                </div>
            </div>
            <div className="flex flex-wrap gap-1 text-sm">
                {entry.keys.length ? (
                    entry.keys.map((cfg: string, index: number) => (
                        <span key={`${cfg}-${index}`}>
                            <span className="bg-secondary/50 inline rounded px-1 py-0.5 font-mono tracking-wide">
                                {cfg}
                            </span>
                            {index < entry.keys.length - 1 && ','}
                        </span>
                    ))
                ) : (
                    <div className="italic">No changes</div>
                )}
            </div>
        </div>
    );
}

//MARK: PageHeaderLinks
type PageHeaderLinksProps = {
    topLabel: string;
    topLink: string;
    bottomLabel: string;
    bottomLink: string;
};
export function PageHeaderLinks(props: PageHeaderLinksProps) {
    return (
        <div className="max-xs:gap-2 xs:flex-col flex px-2 py-1">
            <TxAnchor href={props.topLink} className="text-sm">
                {props.topLabel}
            </TxAnchor>
            <TxAnchor href={props.bottomLink} className="text-sm">
                {props.bottomLabel}
            </TxAnchor>
        </div>
    );
}

//MARK: PageHeader
type PageHeaderProps = {
    title: string;
    icon?: React.ReactNode;
    description?: string;
    parentName?: string;
    parentLink?: string;
    children?: React.ReactNode;
};

/**
 * Standardized page header. Renders above the page body + playerlist sidebar
 * (hoisted via {@link usePageHeader}) so it spans the full content width and
 * aligns with the playerlist sidebar below it.
 *
 * IMPORTANT: `PageHeader` does NOT render any DOM at its call site — it
 * publishes a `<PageHeaderContent />` element through `usePageHeader` and
 * returns `null`. The actual markup is rendered by the layout slot that
 * subscribes to `pageHeaderAtom`. Place `<PageHeader />` anywhere inside the
 * page tree; the JSX will appear in the hoisted header region rather than
 * inline.
 *
 * Layout (rendered by `PageHeaderContent`):
 *  - Accent bar (primary) on the left
 *  - Optional icon tile
 *  - Breadcrumb (parent > title) or just title
 *  - Optional description
 *  - Optional `children` rendered as action slot on the right
 *  - Bottom divider
 */
export function PageHeader(props: PageHeaderProps) {
    // Hoist the header JSX to the layout-level slot via usePageHeader; this
    // component intentionally renders nothing at its original location.
    usePageHeader(<PageHeaderContent {...props} />);
    return null;
}

function PageHeaderContent({ title, icon, description, parentName, parentLink, children }: PageHeaderProps) {
    return (
        <div className="mb-3 md:mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                    <span className="bg-primary/70 h-9 w-1 shrink-0 rounded-full sm:h-10" />
                    {icon ? (
                        <div className="bg-secondary/40 border-border/50 text-accent/80 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border sm:h-10 sm:w-10 [&>svg]:size-4 sm:[&>svg]:size-5">
                            {icon}
                        </div>
                    ) : null}
                    <div className="min-w-0">
                        {parentName && parentLink ? (
                            <div className="text-muted-foreground/60 mb-0.5 flex items-center gap-1 text-xs">
                                <Link href={parentLink} className="hover:text-foreground transition-colors">
                                    {parentName}
                                </Link>
                                <ChevronRightIcon className="size-3" />
                            </div>
                        ) : null}
                        <h1 className="text-foreground truncate text-xl leading-tight font-bold tracking-tight sm:text-2xl">
                            {title}
                        </h1>
                        {description ? (
                            <p className="text-muted-foreground/60 mt-0.5 truncate text-xs sm:text-sm">{description}</p>
                        ) : null}
                    </div>
                </div>
                {children ? (
                    <div className="-mx-0.5 flex flex-wrap items-center gap-2 overflow-x-auto px-0.5">{children}</div>
                ) : null}
            </div>
            <div className="border-border/40 mt-3 border-b sm:mt-4" />
        </div>
    );
}
