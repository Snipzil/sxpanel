import { useEffect, useRef, useState } from 'react';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2Icon, WrenchIcon } from 'lucide-react';
import useSWR from 'swr';
import { PageHeader } from '@/components/page-header';
import { isDevMockStatusOptInEnabled, setDevMockStatusOptInEnabled } from '@/lib/devFlags';

type AdvancedDataResp = {
    verbosityEnabled: boolean;
};

type AdvancedActionResp = {
    type?: string;
    message?: string;
    refresh?: boolean;
    error?: string;
};

export default function AdvancedPage() {
    const magicInputRef = useRef<HTMLInputElement>(null);
    const [magicOutput, setMagicOutput] = useState('What will happen when its pressed?!');
    const [isRunning, setIsRunning] = useState(false);
    const [devMockStatusEnabled, setDevMockStatusEnabled] = useState(() => isDevMockStatusOptInEnabled());

    useEffect(() => {
        setDevMockStatusOptInEnabled(devMockStatusEnabled);
    }, [devMockStatusEnabled]);

    const dataApi = useBackendApi<AdvancedDataResp>({
        method: 'GET',
        path: '/advanced/data',
    });

    const actionApi = useBackendApi<AdvancedActionResp>({
        method: 'POST',
        path: '/advanced',
    });

    const swrDataFetcher = async () => {
        return new Promise<AdvancedDataResp>((resolve, reject) => {
            dataApi({
                success(data) {
                    resolve(data);
                },
                error(msg) {
                    reject(new Error(msg));
                },
            });
        });
    };

    const { data, mutate } = useSWR('/advanced/data', swrDataFetcher);

    const handleAction = (
        action: string,
        parameter: string | boolean = false,
        onSuccess?: (d: AdvancedActionResp) => void,
    ) => {
        setIsRunning(true);
        actionApi({
            data: { action, parameter },
            toastLoadingMessage: 'Executing...',
            genericHandler: {
                successMsg: 'Done.',
            },
            success(respData) {
                setIsRunning(false);
                if (respData.refresh) {
                    mutate();
                    txToast.success('Done. Page refreshed.');
                    return;
                }
                if (onSuccess) {
                    onSuccess(respData);
                } else if (respData.type && respData.message) {
                    const toastType = respData.type as 'success' | 'warning' | 'error' | 'info';
                    txToast[toastType]?.(respData.message) ?? txToast.default(respData.message);
                }
            },
            error(msg) {
                setIsRunning(false);
                txToast.error(msg);
            },
        });
    };

    return (
        <div className="mx-auto w-full max-w-(--breakpoint-xl) space-y-4 px-2 md:px-0">
            <PageHeader
                icon={<WrenchIcon />}
                title="Advanced"
                description="Experimental tools and low-level runtime controls."
            />

            <div className="border-warning/30 bg-warning-hint rounded-xl border p-4 text-center text-sm shadow-sm">
                <strong>
                    This is a page exclusively for advanced users.
                    <br />
                    Do not expect any support in our Discord if you mess with something on this page.
                </strong>
                <br />
                This is also an undocumented feature for a reason: nothing here is expected to work properly and things
                might be added or removed for any reason.
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="bg-card border-border/60 rounded-xl border p-4 shadow-sm">
                    <div className="mb-4 space-y-1">
                        <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                            Runtime Controls
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Development and support toggles that affect panel and runtime behavior.
                        </p>
                    </div>

                    <div className="space-y-4 text-center">
                        {/* Dev mock status toggle */}
                        <div className="bg-muted/30 rounded-lg border p-4">
                            <p className="text-muted-foreground text-sm">
                                Use mock Socket status data on the panel (development only).
                                <br />
                                Reload the page after changing this toggle.
                            </p>
                            <div className="mt-2 flex items-center justify-center gap-3">
                                <Switch
                                    checked={devMockStatusEnabled}
                                    onCheckedChange={setDevMockStatusEnabled}
                                    aria-label="Enable mock status data"
                                />
                                <span className="text-sm font-medium">
                                    Mock status: {devMockStatusEnabled ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>

                        {/* Verbosity toggle */}
                        <div className="bg-muted/30 rounded-lg border p-4">
                            <p className="text-muted-foreground text-sm">
                                With verbosity enabled, you will see more detailed information on the terminal.
                                <br />
                                Good to help getting information on errors.
                            </p>
                            {data?.verbosityEnabled ? (
                                <Button
                                    variant="destructive"
                                    className="mt-2"
                                    disabled={isRunning}
                                    onClick={() => handleAction('change_verbosity', 'false')}
                                >
                                    {isRunning && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                    Disable Verbosity
                                </Button>
                            ) : (
                                <Button
                                    variant="default"
                                    className="bg-success hover:bg-success/80 mt-2"
                                    disabled={isRunning}
                                    onClick={() => handleAction('change_verbosity', 'true')}
                                >
                                    {isRunning && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                    Enable Verbosity
                                </Button>
                            )}
                        </div>

                        {/* Profile Monitor */}
                        <div className="bg-muted/30 rounded-lg border p-4">
                            <p className="text-muted-foreground text-sm">
                                This will execute the profiler in the Monitor for 5 seconds.
                                <br />
                                Requires the Server to be started for showing the profiler URL.
                            </p>
                            <Button
                                variant="outline"
                                className="mt-2"
                                disabled={isRunning}
                                onClick={() => handleAction('profile_monitor')}
                            >
                                {isRunning && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                Profile Monitor
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="bg-card border-border/60 rounded-xl border p-4 shadow-sm">
                    <div className="mb-4 space-y-1">
                        <h2 className="text-muted-foreground/60 text-sm font-medium tracking-wider uppercase">
                            Action Console
                        </h2>
                        <p className="text-muted-foreground text-sm">
                            Run internal advanced actions and inspect the raw response payload.
                        </p>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <Input ref={magicInputRef} defaultValue="perform_magic" className="flex-1" />
                            <Button
                                variant="outline"
                                disabled={isRunning}
                                onClick={() => {
                                    const val = magicInputRef.current?.value?.trim() ?? 'perform_magic';
                                    handleAction(val, false, (d) => {
                                        if (d.type === 'success') {
                                            setMagicOutput(d.message ?? '');
                                        } else if (d.message) {
                                            const toastType = d.type as 'warning' | 'error' | 'info';
                                            txToast[toastType]?.(d.message) ?? txToast.default(d.message);
                                        }
                                    });
                                }}
                            >
                                {isRunning && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                                Magic Button
                            </Button>
                        </div>
                        <pre className="bg-muted/50 text-secondary-foreground max-h-96 overflow-auto rounded-lg border p-3 text-sm">
                            {magicOutput}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
