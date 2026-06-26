import { throttle } from 'throttle-debounce';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsUpDownIcon, XIcon, ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/auth';
import type { HistoryTableSearchType } from '@shared/historyApiTypes';
import {
    availableSearchTypes,
    SEARCH_ANY_STRING,
    type HistorySearchReturnState,
} from '@/pages/History/historySearchConfig';

const throttleFunc = throttle(
    1250,
    (func: () => void) => {
        func();
    },
    { noLeading: true },
);

type HistorySearchBarProps = {
    doSearch: (
        search: HistoryTableSearchType,
        filterByType: string | undefined,
        filterByAdmin: string | undefined,
    ) => void;
    initialState: HistorySearchReturnState;
    adminStats: { name: string; actions: number }[];
};

export function HistorySearchBar({ doSearch, initialState, adminStats }: HistorySearchBarProps) {
    const { authData } = useAuth();
    const inputRef = useRef<HTMLInputElement>(null);
    const [currSearchType, setCurrSearchType] = useState(initialState.search.type);
    const [hasSearchText, setHasSearchText] = useState(!!initialState.search.value);
    const [typeFilter, setTypeFilter] = useState(initialState.filterByType ?? SEARCH_ANY_STRING);
    const [adminNameFilter, setAdminNameFilter] = useState(initialState.filterByAdmin ?? SEARCH_ANY_STRING);

    const authName = authData && typeof authData === 'object' ? authData.name : undefined;

    const updateSearch = useCallback(() => {
        if (!inputRef.current) return;
        const searchValue = inputRef.current.value.trim();
        const effectiveTypeFilter = typeFilter !== SEARCH_ANY_STRING ? typeFilter : undefined;
        const effectiveAdminNameFilter = adminNameFilter !== SEARCH_ANY_STRING ? adminNameFilter : undefined;
        doSearch({ value: searchValue, type: currSearchType }, effectiveTypeFilter, effectiveAdminNameFilter);
    }, [doSearch, currSearchType, typeFilter, adminNameFilter]);

    useEffect(() => {
        updateSearch();
    }, [updateSearch]);

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            throttleFunc.cancel({ upcomingOnly: true });
            updateSearch();
        } else if (e.key === 'Escape') {
            inputRef.current!.value = '';
            throttleFunc(updateSearch);
            setHasSearchText(false);
        } else {
            throttleFunc(updateSearch);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setHasSearchText(e.currentTarget.value.length > 0);
    };

    const clearSearchBtn = () => {
        inputRef.current!.value = '';
        throttleFunc.cancel({ upcomingOnly: true });
        updateSearch();
        setHasSearchText(false);
    };

    const filteredAdmins = useMemo(() => adminStats.filter((admin) => admin.name !== authName), [adminStats, authName]);
    const selfActionCount = useMemo(
        () => adminStats.find((admin) => admin.name === authName)?.actions ?? 0,
        [adminStats, authName],
    );

    const selectedSearchType = availableSearchTypes.find((type) => type.value === currSearchType);
    if (!selectedSearchType) throw new Error(`Invalid search type: ${currSearchType}`);
    if (!authData) throw new Error('authData is not available');

    return (
        <div className="border-border/60 bg-card text-card-foreground mb-4 rounded-xl border p-4 shadow-sm">
            <div className="flex flex-wrap-reverse gap-2">
                <div className="relative min-w-44 grow">
                    <Input
                        type="text"
                        autoCapitalize="off"
                        autoCorrect="off"
                        ref={inputRef}
                        placeholder={selectedSearchType.placeholder}
                        defaultValue={initialState.search.value}
                        onKeyDown={handleInputKeyDown}
                        onChange={handleInputChange}
                        className={hasSearchText ? 'pr-9' : undefined}
                    />
                    {hasSearchText ? (
                        <button
                            type="button"
                            className="ring-offset-background focus-visible:ring-ring text-muted-foreground absolute inset-y-0 right-2 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                            onClick={clearSearchBtn}
                            aria-label="Clear search"
                        >
                            <XIcon className="size-4" />
                        </button>
                    ) : null}
                </div>

                <div className="flex grow flex-wrap content-start gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="xs:w-48 grow justify-between md:grow-0">
                                Search by {selectedSearchType.label}
                                <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48" align="start">
                            <DropdownMenuLabel>Search type</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuRadioGroup value={currSearchType} onValueChange={setCurrSearchType}>
                                {availableSearchTypes.map((searchType) => (
                                    <DropdownMenuRadioItem
                                        key={searchType.value}
                                        value={searchType.value}
                                        className="cursor-pointer"
                                    >
                                        {searchType.label}
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-36 grow md:grow-0">
                            <SelectValue placeholder="Filter by type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={SEARCH_ANY_STRING} className="cursor-pointer">
                                Any type
                            </SelectItem>
                            <SelectItem value="ban" className="cursor-pointer">
                                Bans
                            </SelectItem>
                            <SelectItem value="warn" className="cursor-pointer">
                                Warns
                            </SelectItem>
                            <SelectItem value="kick" className="cursor-pointer">
                                Kicks
                            </SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={adminNameFilter} onValueChange={setAdminNameFilter}>
                        <SelectTrigger className="w-40 grow md:grow-0">
                            <SelectValue placeholder="Filter by admin" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={SEARCH_ANY_STRING} className="cursor-pointer">
                                Any admin
                            </SelectItem>
                            <SelectItem value={authData.name} className="cursor-pointer">
                                {authData.name} <span className="text-muted-foreground">({selfActionCount})</span>
                            </SelectItem>
                            <SelectSeparator />
                            {filteredAdmins.map((admin) => (
                                <SelectItem key={admin.name} value={admin.name} className="cursor-pointer">
                                    {admin.name} <span className="text-muted-foreground">({admin.actions})</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <div className="flex grow justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="grow md:grow-0">
                                    More
                                    <ChevronDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem className="h-10 py-2 pr-2 pl-1" asChild>
                                    <Link href="/settings#danger-zone" className="cursor-pointer">
                                        <ExternalLinkIcon className="mr-1 inline h-4" />
                                        Bulk remove
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="h-10 py-2 pr-2 pl-1" asChild>
                                    <Link href="/settings/ban-templates" className="cursor-pointer">
                                        <ExternalLinkIcon className="mr-1 inline h-4" />
                                        Ban templates
                                    </Link>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>
            <p className="text-muted-foreground mt-2 px-1 text-xs">{selectedSearchType.description}</p>
        </div>
    );
}
