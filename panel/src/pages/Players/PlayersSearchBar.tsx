import { throttle } from 'throttle-debounce';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsUpDownIcon, FilterXIcon, XIcon, ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PlayersTableFiltersType, PlayersTableSearchType } from '@shared/playerApiTypes';
import { Link } from 'wouter';
import {
    availableSearchTypes,
    availableFilters,
    type PlayersSearchBoxReturnStateType,
} from '@/pages/Players/players-search-config';

const throttleFunc = throttle(
    1250,
    (func: () => void) => {
        func();
    },
    { noLeading: true },
);

type PlayerSearchUiState = {
    isSearchTypeDropdownOpen: boolean;
    isFilterDropdownOpen: boolean;
    currSearchType: string;
    selectedFilters: string[];
    hasSearchText: boolean;
    rememberSearchType: boolean;
};

type PlayersSearchBarProps = {
    doSearch: (search: PlayersTableSearchType, filters: PlayersTableFiltersType, rememberSearchType: boolean) => void;
    initialState: PlayersSearchBoxReturnStateType & { rememberSearchType: boolean };
};

export function PlayersSearchBar({ doSearch, initialState }: PlayersSearchBarProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uiState, setUiState] = useState<PlayerSearchUiState>(() => ({
        isSearchTypeDropdownOpen: false,
        isFilterDropdownOpen: false,
        currSearchType: initialState.search.type,
        selectedFilters: initialState.filters,
        hasSearchText: !!initialState.search.value,
        rememberSearchType: initialState.rememberSearchType,
    }));
    const {
        isSearchTypeDropdownOpen,
        isFilterDropdownOpen,
        currSearchType,
        selectedFilters,
        hasSearchText,
        rememberSearchType,
    } = uiState;

    const setUiField = <K extends keyof PlayerSearchUiState>(key: K, value: PlayerSearchUiState[K]) => {
        setUiState((prev) => ({ ...prev, [key]: value }));
    };

    const updateSearch = useCallback(() => {
        if (!inputRef.current) return;
        const searchValue = inputRef.current.value.trim();
        doSearch({ value: searchValue, type: currSearchType }, selectedFilters, rememberSearchType);
    }, [doSearch, currSearchType, selectedFilters, rememberSearchType]);

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
            setUiField('hasSearchText', false);
        } else {
            throttleFunc(updateSearch);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUiField('hasSearchText', e.currentTarget.value.length > 0);
    };

    const clearSearchBtn = () => {
        inputRef.current!.value = '';
        throttleFunc.cancel({ upcomingOnly: true });
        updateSearch();
        setUiField('hasSearchText', false);
    };

    const filterSelectChange = (filter: string, checked: boolean) => {
        setUiState((prev) => ({
            ...prev,
            selectedFilters: checked
                ? [...prev.selectedFilters, filter]
                : prev.selectedFilters.filter((currentFilter) => currentFilter !== filter),
        }));
    };

    const selectedSearchType = availableSearchTypes.find((type) => type.value === currSearchType);
    if (!selectedSearchType) throw new Error(`Invalid search type: ${currSearchType}`);
    const filterBtnMessage = selectedFilters.length
        ? `${selectedFilters.length} Filter${selectedFilters.length > 1 ? 's' : ''}`
        : 'No filters';

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
                    <DropdownMenu
                        open={isSearchTypeDropdownOpen}
                        onOpenChange={(open) => setUiField('isSearchTypeDropdownOpen', open)}
                    >
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                aria-expanded={isSearchTypeDropdownOpen}
                                className="xs:w-48 grow justify-between md:grow-0"
                            >
                                Search by {selectedSearchType.label}
                                <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48" align="start">
                            <DropdownMenuLabel>Search type</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuRadioGroup
                                value={currSearchType}
                                onValueChange={(value) => setUiField('currSearchType', value)}
                            >
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
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem
                                checked={rememberSearchType}
                                className="cursor-pointer"
                                onCheckedChange={(checked) => setUiField('rememberSearchType', checked === true)}
                            >
                                Remember option
                            </DropdownMenuCheckboxItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu
                        open={isFilterDropdownOpen}
                        onOpenChange={(open) => setUiField('isFilterDropdownOpen', open)}
                    >
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="outline"
                                aria-expanded={isFilterDropdownOpen}
                                className="xs:w-44 grow justify-between md:grow-0"
                            >
                                {filterBtnMessage}
                                <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-44" align="start">
                            <DropdownMenuLabel>Search filters</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {availableFilters.map((filter) => (
                                <DropdownMenuCheckboxItem
                                    key={filter.value}
                                    checked={selectedFilters.includes(filter.value)}
                                    className="cursor-pointer"
                                    onCheckedChange={(checked) => {
                                        filterSelectChange(filter.value, checked === true);
                                    }}
                                >
                                    {filter.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() => setUiField('selectedFilters', [])}
                            >
                                <FilterXIcon className="mr-2 size-4" />
                                Clear filters
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

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
                                    <Link href="/ban-identifiers" className="cursor-pointer">
                                        <ExternalLinkIcon className="mr-1 inline h-4" />
                                        Ban identifiers
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem className="h-10 py-2 pr-2 pl-1" asChild>
                                    <Link href="/settings#danger-zone" className="cursor-pointer">
                                        <ExternalLinkIcon className="mr-1 inline h-4" />
                                        Prune players / HWIDs
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
