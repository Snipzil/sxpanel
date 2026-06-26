import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

type WhitelistPaginationProps = {
    currPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export function WhitelistPagination({ currPage, totalPages, onPageChange }: WhitelistPaginationProps) {
    if (totalPages <= 1) return null;
    return (
        <div className="border-border/40 flex items-center justify-center gap-3 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => onPageChange(currPage - 1)} disabled={currPage <= 1}>
                <ChevronLeftIcon className="size-4" />
                Previous
            </Button>
            <span className="text-muted-foreground text-sm tabular-nums">
                Page {currPage} of {totalPages}
            </span>
            <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currPage + 1)}
                disabled={currPage >= totalPages}
            >
                Next
                <ChevronRightIcon className="size-4" />
            </Button>
        </div>
    );
}
