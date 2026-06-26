import { txToast } from '@/components/TxToaster';
import { cn, copyToClipboard } from '@/lib/utils';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { CopyIcon, ListTodoIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useOpenConfirmDialog, useOpenPromptDialog } from '@/hooks/dialogs';

const InvisibleNewLine = () => <span className="opacity-0">{'\n'}</span>;

const placeholderIds = ['fivem:xxxxxxx', 'license:xxxxxxxxxxxxxx', 'discord:xxxxxxxxxxxxxxxxxx', 'etc...'].join('\n');
const placeholderHwids = ['2:xxxxxxxxxxxxxx...', '4:xxxxxxxxxxxxxx...', '5:xxxxxxxxxxxxxx...', 'etc...'].join('\n');

type ActionFeedback = {
    msg: string;
    success: boolean;
};

type MultiIdsList = {
    list: string[];
    highlighted?: string[];
    type: 'hwid' | 'id';
    src: 'player' | 'action';
    isHwids?: boolean;
    onWipeIds?: () => void;
};

export default function MultiIdsList({ list, highlighted, type, src, onWipeIds }: MultiIdsList) {
    const [autoAnimateParentRef, enableAnimations] = useAutoAnimate();
    const divRef = useRef<HTMLDivElement>(null);
    const msgRef = useRef<HTMLSpanElement>(null);
    const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [compareMatches, setCompareMatches] = useState<string[] | null>(null);
    const [actionFeedback, setActionFeedback] = useState<ActionFeedback | false>(false);

    const hasHighlighted = Array.isArray(highlighted) && highlighted.length;
    const idsHighlighted = hasHighlighted
        ? highlighted.sort((a, b) => a.localeCompare(b))
        : list.sort((a, b) => a.localeCompare(b));
    const idsMuted = hasHighlighted
        ? list.filter((id) => !highlighted.includes(id)).sort((a, b) => a.localeCompare(b))
        : [];

    const hasIdsAvailable = idsHighlighted.length || idsMuted.length;
    const openConfirmDialog = useOpenConfirmDialog();
    const openPromptDialog = useOpenPromptDialog();

    const isHwids = type === 'hwid';
    const typeStr = isHwids ? 'HWID' : 'ID';
    const emptyMessage = `This ${src} has no ${typeStr}s.`;
    const isInCompareMode = Array.isArray(compareMatches);
    const isCompareIdMatch = (id: string) => isInCompareMode && compareMatches.includes(id);

    useEffect(() => {
        return () => {
            if (feedbackTimeoutRef.current) {
                clearTimeout(feedbackTimeoutRef.current);
            }
        };
    }, []);

    const showActionFeedback = (feedback: ActionFeedback) => {
        setActionFeedback(feedback);
        if (feedbackTimeoutRef.current) {
            clearTimeout(feedbackTimeoutRef.current);
        }
        feedbackTimeoutRef.current = setTimeout(() => {
            setActionFeedback(false);
            feedbackTimeoutRef.current = null;
        }, 2750);
    };

    const handleWipeIds = () => {
        if (!onWipeIds) return;
        const target = isHwids ? `${typeStr}s` : `${typeStr}s (except license)`;
        openConfirmDialog({
            title: `Wipe ${src} ${typeStr}s`,
            message: (
                <p>
                    Are you sure you want wipe all {target} of this {src}? <br />
                    <strong>This action cannot be undone.</strong>
                </p>
            ),
            onConfirm: onWipeIds,
        });
    };

    const handleCompareIds = () => {
        openPromptDialog({
            title: `Compare ${typeStr}s`,
            message: (
                <p>
                    Paste in a list of {typeStr}s to compare with the current list. <br />
                    Separate each {typeStr} with a new line or comma.
                </p>
            ),
            placeholder: isHwids ? placeholderHwids : placeholderIds,
            submitLabel: 'Compare',
            required: true,
            isMultiline: true,
            isWide: true,
            onSubmit: (input) => {
                const cleanIds = input.split(/[\n\s,;]+/).reduce<string[]>((ids, rawId) => {
                    const id = rawId.trim();
                    if (id.length && list.includes(id)) {
                        ids.push(id);
                    }
                    return ids;
                }, []);
                setCompareMatches(cleanIds);
            },
        });
    };

    const handleCopyIds = () => {
        if (!divRef.current) throw new Error(`divRef.current undefined`);
        if (!hasIdsAvailable) return;

        //Just to guarantee the correct visual order
        const strToCopy = [...idsHighlighted, ...idsMuted].join('\r\n');

        //Copy the ids to the clipboard
        copyToClipboard(strToCopy, divRef.current)
            .then((res) => {
                if (res !== false) {
                    showActionFeedback({
                        msg: 'Copied!',
                        success: true,
                    });
                } else {
                    txToast.error('Failed to copy to clipboard :(');
                }
            })
            .catch((error) => {
                txToast.error({
                    title: 'Failed to copy to clipboard:',
                    msg: error.message,
                });
                showActionFeedback({
                    msg: 'Error :(',
                    success: false,
                });
            });
    };

    return (
        <div>
            <div className="flex items-center justify-between pb-1" ref={divRef}>
                <h3 className="text-xl">
                    {isHwids ? 'Hardware IDs' : 'Player Identifiers'}
                    {isInCompareMode && compareMatches.length ? (
                        <span className="text-success-inline ml-2 text-sm font-normal italic">
                            ({compareMatches.length} matches found)
                        </span>
                    ) : null}
                </h3>
                <div
                    ref={autoAnimateParentRef}
                    className={cn('flex min-h-6 w-24 justify-end gap-2.5', !hasIdsAvailable && 'hidden')}
                >
                    {actionFeedback ? (
                        <span
                            ref={msgRef}
                            className={cn(
                                'animate-toastbar-enter pointer-events-none w-full text-center text-sm select-none',
                                actionFeedback.success ? 'text-success-inline' : 'text-destructive-inline',
                            )}
                        >
                            {actionFeedback.msg}
                        </span>
                    ) : (
                        <>
                            {onWipeIds && (
                                <button onClick={handleWipeIds} title="Wipe all IDs except license.">
                                    <Trash2Icon className="hover:text-destructive h-5 opacity-50 hover:opacity-100" />
                                </button>
                            )}
                            <button onClick={handleCompareIds} title="Compare IDs.">
                                <ListTodoIcon className="hover:text-primary h-6 opacity-50 hover:opacity-100" />
                            </button>
                            <button onClick={handleCopyIds} title="Copy IDs to clipboard.">
                                <CopyIcon className="hover:text-primary h-5 opacity-50 hover:opacity-100" />
                            </button>
                        </>
                    )}
                </div>
            </div>
            <div className="relative rounded border">
                <p
                    className={cn(
                        'divide-border/50 text-muted-foreground divide-y rounded-[inherit] font-mono break-all whitespace-pre-wrap',
                        hasIdsAvailable && isHwids
                            ? 'text-2xs leading-5 font-extralight tracking-widest'
                            : 'text-xs leading-6 tracking-wider',
                    )}
                >
                    {!hasIdsAvailable && <span className="block px-1 italic opacity-50">{emptyMessage}</span>}
                    {idsHighlighted.map((id) => (
                        <span
                            key={id}
                            className={cn(
                                'block px-1 font-semibold',
                                isInCompareMode &&
                                    (isCompareIdMatch(id) ? 'text-success-inline font-semibold' : 'opacity-50'),
                            )}
                        >
                            {id}
                            <InvisibleNewLine />
                        </span>
                    ))}
                    {idsMuted.map((id) => (
                        <span
                            key={id}
                            className={cn(
                                'block px-1 opacity-50',
                                isCompareIdMatch(id) && 'text-success-inline font-semibold opacity-100',
                            )}
                        >
                            {id}
                            <InvisibleNewLine />
                        </span>
                    ))}
                </p>
                {isInCompareMode && !compareMatches.length && (
                    <>
                        <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/25 p-4 backdrop-blur-xs">
                            <span className="text-warning-inline text-xl tracking-wider">
                                No matching {typeStr} found.
                            </span>
                        </div>

                        <button
                            className="ring-offset-background absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                            onClick={() => setCompareMatches(null)}
                        >
                            <XIcon className="size-8 sm:h-6 sm:w-6" />
                            <span className="sr-only">Close</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
