import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ISearchDecorationOptions, ISearchOptions, SearchAddon } from '@xterm/addon-search';
import { ArrowDownIcon, ArrowUpIcon, CaseSensitiveIcon, RegexIcon, WholeWordIcon, XIcon } from 'lucide-react';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useEventListener } from 'usehooks-ts';
import { useLocale } from '@/hooks/locale';

type ButtonProps = {
    title?: string;
    onClick: () => void;
    isActive?: boolean;
    children: ReactNode;
};

function SearchBarButton({ title, onClick, isActive, children }: ButtonProps) {
    return (
        <button
            title={title}
            className={cn(
                'rounded p-0.5',
                'hover:bg-secondary-foreground hover:text-secondary',
                'focus:ring-secondary-foreground focus:ring-offset-1x focus:ring-offset-secondary-foreground focus:ring-1 focus:outline-hidden',
                isActive && 'bg-muted-foreground text-secondary',
            )}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

const xtermDecorations = {
    activeMatchBackground: '#FF00DC',
    activeMatchColorOverviewRuler: '#FF00DC',
    matchBackground: '#732268',
    matchOverviewRuler: '#732268',
} satisfies ISearchDecorationOptions;

type LiveConsoleSearchBarProps = {
    setShow: (show: boolean) => void;
    searchAddon: SearchAddon;
};

export default function LiveConsoleSearchBar({ setShow, searchAddon }: LiveConsoleSearchBarProps) {
    const { t } = useLocale();
    const labelNoResults = t('panel.live_console.search.no_results');
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [regex, setRegex] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [resultCount, setResultCount] = useState(labelNoResults);
    const handleInputRef = useCallback((node: HTMLInputElement | null) => {
        inputRef.current = node;
        node?.focus();
    }, []);

    //helpers
    const clearSearchState = (newStatus?: string) => {
        searchAddon.clearDecorations();
        if (newStatus) {
            setResultCount(newStatus);
        }
    };
    const getSearchOptions = (overrides?: Partial<ISearchOptions>): ISearchOptions => ({
        decorations: xtermDecorations,
        caseSensitive,
        wholeWord,
        regex,
        ...overrides,
    });

    useEffect(() => {
        return () => {
            clearSearchState(labelNoResults);
        };
    }, [searchAddon, labelNoResults]);

    //listens to the result count change
    useEffect(() => {
        if (!searchAddon) return;
        const dispose = searchAddon.onDidChangeResults(({ resultIndex, resultCount }) => {
            if (resultIndex === -1) {
                setResultCount(labelNoResults);
            } else {
                setResultCount(`${resultIndex + 1}/${resultCount}`);
            }
        });
        return () => {
            dispose.dispose();
        };
    }, [searchAddon, labelNoResults]);

    //Handlers
    const handlePrevious = () => {
        if (!inputRef.current || !inputRef.current.value) return;
        searchAddon.findPrevious(inputRef.current.value, getSearchOptions());
    };
    const handleNext = () => {
        if (!inputRef.current || !inputRef.current.value) return;
        searchAddon.findNext(inputRef.current.value, getSearchOptions());
    };
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!inputRef.current) return;
        if (e.code === 'Enter') {
            if (e.shiftKey) {
                handlePrevious();
            } else {
                handleNext();
            }
            e.preventDefault();
        }
    };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!inputRef.current) return;
        handleNext();
    };

    const handleCaseSensitiveMode = () => {
        if (!inputRef.current) return;
        setCaseSensitive(!caseSensitive);
        clearSearchState();
        searchAddon.findNext(inputRef.current.value, getSearchOptions({ caseSensitive: !caseSensitive }));
    };
    const handleWholeWordMode = () => {
        if (!inputRef.current) return;
        setWholeWord(!wholeWord);
        clearSearchState();
        searchAddon.findNext(inputRef.current.value, getSearchOptions({ wholeWord: !wholeWord }));
    };
    const handleRegexMode = () => {
        if (!inputRef.current) return;
        setRegex(!regex);
        clearSearchState();
        searchAddon.findNext(inputRef.current.value, getSearchOptions({ regex: !regex }));
    };

    //This is required so hotkeys in the page also apply in here
    useEventListener('message', (e: TxMessageEvent) => {
        if (e.data.type !== 'liveConsoleSearchHotkey') return;
        if (e.data.action === 'previous') {
            handlePrevious();
        } else if (e.data.action === 'next') {
            handleNext();
        } else if (e.data.action === 'focus') {
            inputRef.current?.focus();
        }
    });

    return (
        <div className="xs:right-4 bg-secondary xs:gap-4 xs:w-auto absolute top-0 z-10 flex w-full flex-wrap items-center justify-center gap-1 rounded-b-lg border border-t-0 p-1 shadow-xl">
            <div className="relative">
                <Input
                    ref={handleInputRef}
                    className="h-8"
                    placeholder={t('panel.live_console.search.placeholder')}
                    onKeyDown={handleInputKeyDown}
                    onChange={handleInputChange}
                    onBlur={() => {
                        searchAddon.clearActiveDecoration();
                    }}
                />
                <div className="text-muted-foreground absolute top-1/2 right-1 flex -translate-y-1/2 transform gap-2">
                    <SearchBarButton
                        title={t('panel.live_console.search.case_sensitive')}
                        isActive={caseSensitive}
                        onClick={handleCaseSensitiveMode}
                    >
                        <CaseSensitiveIcon className="size-5" />
                    </SearchBarButton>
                    <SearchBarButton
                        title={t('panel.live_console.search.whole_word')}
                        isActive={wholeWord}
                        onClick={handleWholeWordMode}
                    >
                        <WholeWordIcon className="size-5" />
                    </SearchBarButton>
                    <SearchBarButton
                        title={t('panel.live_console.search.regex')}
                        isActive={regex}
                        onClick={handleRegexMode}
                    >
                        <RegexIcon className="h-4 w-5" />
                    </SearchBarButton>
                </div>
            </div>
            <div className="text-muted-foreground flex min-w-[8ch] grow text-sm">{resultCount}</div>
            <div className="text-muted-foreground flex gap-2">
                <SearchBarButton title={t('panel.live_console.search.previous')} onClick={handlePrevious}>
                    <ArrowUpIcon className="size-5" />
                </SearchBarButton>
                <SearchBarButton title={t('panel.live_console.search.next')} onClick={handleNext}>
                    <ArrowDownIcon className="size-5" />
                </SearchBarButton>
                <SearchBarButton
                    title={t('panel.live_console.search.close')}
                    onClick={() => {
                        clearSearchState(labelNoResults);
                        setShow(false);
                    }}
                >
                    <XIcon className="size-5" />
                </SearchBarButton>
            </div>
        </div>
    );
}
