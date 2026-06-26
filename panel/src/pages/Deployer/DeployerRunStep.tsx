import { useEffect, useReducer, useRef } from 'react';
import { useBackendApi } from '@/hooks/fetch';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { createDuplicateKeyResolver } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { StatusResp } from './deployerTypes';
import { MOCK_DEPLOY_LOG_LINES } from './deployerPreviewMock';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { deployerStepActionsClass, deployerStepBodyClass } from './deployerLayout';

type StepRunState = {
    log: string[];
    progress: number;
    status: StatusResp['status'];
    statusError: string | null;
};

function reduceStepRunState(state: StepRunState, action: Partial<StepRunState>): StepRunState {
    return { ...state, ...action };
}

function StatusPill({ status }: { status: StatusResp['status'] }) {
    return (
        <span
            className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                status === 'running' && 'border-primary/30 bg-primary/10 text-primary',
                status === 'done' && 'border-success/30 bg-success/10 text-success-inline',
                status === 'failed' && 'border-destructive/30 bg-destructive/10 text-destructive',
            )}
        >
            {status === 'running' ? 'Running' : status === 'done' ? 'Done' : 'Failed'}
        </span>
    );
}

export function DeployerRunStep({
    deployPath,
    onBack,
    onDone,
    onCancel,
    previewMode,
}: {
    deployPath: string;
    onBack?: () => void;
    onDone: () => void;
    onCancel: () => void;
    previewMode?: boolean;
}) {
    const [state, dispatch] = useReducer(reduceStepRunState, {
        log: previewMode ? MOCK_DEPLOY_LOG_LINES.slice(0, 3) : [],
        progress: previewMode ? 24 : 0,
        status: previewMode ? 'running' : 'running',
        statusError: null,
    });
    const { log, progress, status, statusError } = state;
    const logEndRef = useRef<HTMLDivElement>(null);
    const getLogKey = createDuplicateKeyResolver();

    const statusApi = useBackendApi<StatusResp>({
        method: 'GET',
        path: '/deployer/status',
    });

    useEffect(() => {
        if (!previewMode) return;
        let i = 3;
        const id = window.setInterval(() => {
            if (i >= MOCK_DEPLOY_LOG_LINES.length) {
                window.clearInterval(id);
                dispatch({
                    log: MOCK_DEPLOY_LOG_LINES,
                    progress: 100,
                    status: 'done',
                    statusError: null,
                });
                return;
            }
            i += 1;
            dispatch({
                log: MOCK_DEPLOY_LOG_LINES.slice(0, i),
                progress: Math.min(95, Math.round((i / MOCK_DEPLOY_LOG_LINES.length) * 100)),
                status: 'running',
                statusError: null,
            });
        }, 650);
        return () => window.clearInterval(id);
    }, [previewMode]);

    useEffect(() => {
        if (previewMode) return;
        const MAX_POLL_RETRIES = 10;
        let cancelled = false;
        let failureCount = 0;
        let pollTimeoutId: number | null = null;

        const schedulePoll = (delay: number) => {
            pollTimeoutId = window.setTimeout(poll, delay);
        };

        const poll = () => {
            if (cancelled) return;
            statusApi({
                success(data) {
                    if (cancelled) return;
                    failureCount = 0;
                    if (data.refresh) {
                        window.location.reload();
                        return;
                    }
                    dispatch({
                        log: data.log || [],
                        progress: data.progress || 0,
                        status: data.status,
                        statusError: null,
                    });
                    if (data.status === 'running') {
                        schedulePoll(1000);
                    }
                },
                error(msg) {
                    if (cancelled) return;
                    failureCount++;
                    if (failureCount >= MAX_POLL_RETRIES) {
                        dispatch({
                            status: 'failed',
                            statusError: msg || 'Lost connection to the server after multiple retries.',
                        });
                        return;
                    }
                    const delay = Math.min(1000 * Math.pow(2, failureCount - 1), 30000);
                    schedulePoll(delay);
                },
            });
        };
        poll();
        return () => {
            cancelled = true;
            if (pollTimeoutId !== null) {
                window.clearTimeout(pollTimeoutId);
            }
        };
    }, [statusApi, previewMode]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [log]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className={deployerStepBodyClass}>
                <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="flex shrink-0 items-center justify-between gap-2">
                        <p className="text-muted-foreground min-w-0 truncate font-mono text-[10px]">{deployPath}</p>
                        <StatusPill status={status} />
                    </div>

                    <div className="shrink-0">
                        <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-muted-foreground text-[10px] font-medium">Progress</span>
                            <span className="text-foreground text-[10px] font-semibold tabular-nums">{progress}%</span>
                        </div>
                        <div className="bg-muted h-1 overflow-hidden rounded-full">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    status === 'failed' && 'bg-destructive',
                                    status === 'done' && 'bg-success',
                                    status === 'running' && 'bg-primary',
                                )}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>

                    <div className="border-border/60 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
                        <div className="bg-muted/80 text-muted-foreground border-border/40 shrink-0 border-b px-2 py-1 font-mono text-[9px] tracking-wide uppercase">
                            deployer output
                        </div>
                        <div className="bg-background/95 min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-snug">
                            {log.map((line) => (
                                <div key={getLogKey(line)} className="text-foreground/90 whitespace-pre-wrap">
                                    {line}
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    </div>

                    {status === 'failed' && (
                        <Alert variant="destructive" className="shrink-0 py-2">
                            <AlertTitle className="text-xs">Deployment failed</AlertTitle>
                            <AlertDescription className="text-xs">
                                {statusError ?? 'Check the log above for details.'}
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            </div>

            <div className={deployerStepActionsClass}>
                <div className="flex gap-2">
                    {onBack && (
                        <Button type="button" variant="outline" size="sm" onClick={onBack}>
                            <ChevronLeftIcon className="mr-1 size-3.5" /> Back
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onCancel}
                        disabled={status === 'running' && !previewMode}
                    >
                        <XIcon className="mr-1 size-3.5" /> Cancel
                    </Button>
                </div>
                {status === 'done' && (
                    <Button type="button" size="sm" onClick={onDone}>
                        {previewMode ? (
                            <>
                                Finish preview <ChevronRightIcon className="ml-1 size-3.5" />
                            </>
                        ) : (
                            <>
                                Continue <ChevronRightIcon className="ml-1 size-3.5" />
                            </>
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
}
