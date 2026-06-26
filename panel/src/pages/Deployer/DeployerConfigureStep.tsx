import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';
import { deployerStepActionsClass, deployerStepBodyClass } from './deployerLayout';

export function DeployerConfigureStep({
    serverCFG,
    previewMode,
    onBack,
    onSave,
    onCancel,
}: {
    serverCFG: string;
    previewMode?: boolean;
    onBack?: () => void;
    onSave: (cfg: string) => void;
    onCancel: () => void;
}) {
    const [cfgText, setCfgText] = useState(serverCFG);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className={deployerStepBodyClass}>
                <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="shrink-0">
                        <h2 className="text-foreground text-sm font-semibold">server.cfg</h2>
                        <p className="text-muted-foreground text-xs">
                            {previewMode
                                ? 'Review the generated config, then continue to run the recipe on your host.'
                                : 'Deploy finished — edit server.cfg, then save and start FXServer.'}
                        </p>
                    </div>
                    <div className="border-border/60 relative min-h-0 flex-1 overflow-hidden rounded-md border">
                        <div className="absolute inset-0">
                            <LazyMonacoEditor
                                height="100%"
                                language="ini"
                                value={cfgText}
                                onChange={(v) => setCfgText(v ?? '')}
                                options={{ minimap: { enabled: false }, wordWrap: 'on', lineNumbers: 'on' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className={deployerStepActionsClass}>
                <div className="flex gap-2">
                    {onBack && (
                        <Button type="button" variant="outline" size="sm" onClick={onBack}>
                            <ChevronLeftIcon className="mr-1 size-3.5" /> Back
                        </Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                        <XIcon className="mr-1 size-3.5" /> {previewMode ? 'Cancel' : 'Discard'}
                    </Button>
                </div>
                <Button type="button" size="sm" onClick={() => onSave(cfgText)}>
                    {previewMode ? (
                        <>
                            Continue <ChevronRightIcon className="ml-1 size-3.5" />
                        </>
                    ) : (
                        <>
                            <CheckIcon className="mr-1 size-3.5" /> Save &amp; start server
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
