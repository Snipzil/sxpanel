import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckIcon, FolderOpenIcon, Loader2Icon } from 'lucide-react';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { cn } from '@/lib/utils';
import type { DeployerWizardDraft } from './deployerFlowTypes';

type ValidateResp = {
    success: boolean;
    message?: string;
    suggestion?: string;
    detectedConfig?: string;
};

export function DeployerExistingServerStep({
    draft,
    serverName,
    skipServerName,
    previewMode,
    onDraftChange,
}: {
    draft: DeployerWizardDraft;
    serverName: string;
    skipServerName?: boolean;
    previewMode?: boolean;
    onDraftChange: (patch: Partial<DeployerWizardDraft>) => void;
}) {
    const [folder, setFolder] = useState(draft.dataFolder);
    const [cfgFile, setCfgFile] = useState(draft.cfgFile);
    const [name, setName] = useState(draft.serverName || serverName);
    const [folderLoading, setFolderLoading] = useState(false);
    const [cfgLoading, setCfgLoading] = useState(false);
    const [suggestion, setSuggestion] = useState<string | null>(null);

    const folderApi = useBackendApi<ValidateResp>({
        method: 'POST',
        path: '/setup/validateLocalDataFolder',
    });
    const cfgApi = useBackendApi<ValidateResp>({
        method: 'POST',
        path: '/setup/validateCFGFile',
    });

    const handleValidateFolder = (overrideFolder?: string) => {
        const f = (overrideFolder ?? folder).trim();
        if (!f) return;

        if (previewMode) {
            onDraftChange({
                dataFolder: f,
                localFolderValid: true,
                detectedConfig: 'server.cfg',
                cfgFile: cfgFile || 'server.cfg',
            });
            setCfgFile((c) => c || 'server.cfg');
            txToast.info('Preview: data folder accepted');
            return;
        }

        setFolderLoading(true);
        setSuggestion(null);
        folderApi({
            data: { dataFolder: f },
            success(data) {
                setFolderLoading(false);
                if (data.success) {
                    const detected = data.detectedConfig || 'server.cfg';
                    onDraftChange({
                        dataFolder: f,
                        localFolderValid: true,
                        detectedConfig: detected,
                        cfgFile: cfgFile || detected,
                    });
                    setCfgFile((c) => c || detected);
                } else if (data.suggestion) {
                    setSuggestion(data.suggestion);
                    txToast.warning(data.message || 'Found a suggestion.');
                } else {
                    txToast.error(data.message || 'Invalid folder.');
                }
            },
            error(msg) {
                setFolderLoading(false);
                txToast.error(msg);
            },
        });
    };

    const handleValidateCfg = () => {
        const cfg = cfgFile.trim();
        if (!cfg || !draft.dataFolder) return;

        if (previewMode) {
            onDraftChange({ cfgFile: cfg, localCfgValid: true, serverName: name });
            txToast.info('Preview: server.cfg accepted');
            return;
        }

        setCfgLoading(true);
        cfgApi({
            data: { template: false, dataFolder: draft.dataFolder, cfgFile: cfg },
            success(data) {
                setCfgLoading(false);
                if (data.success) {
                    onDraftChange({
                        cfgFile: cfg,
                        localCfgValid: true,
                        serverName: name,
                    });
                } else {
                    txToast.error(data.message || 'Invalid CFG file.');
                }
            },
            error(msg) {
                setCfgLoading(false);
                txToast.error(msg);
            },
        });
    };

    const acceptSuggestion = () => {
        if (!suggestion) return;
        setFolder(suggestion);
        handleValidateFolder(suggestion);
    };

    return (
        <div className="border-border/60 space-y-3 rounded-lg border p-3">
            <div className="flex items-start gap-2">
                <FolderOpenIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div>
                    <p className="text-foreground text-xs font-semibold">Existing server data</p>
                    <p className="text-muted-foreground text-[10px]">
                        Point at a folder that already has <span className="font-mono">server.cfg</span> and{' '}
                        <span className="font-mono">resources/</span>. Skips the recipe deployer.
                    </p>
                </div>
            </div>

            {!skipServerName && (
                <div className="space-y-1.5">
                    <Label htmlFor="existing_server_name">Server name</Label>
                    <Input
                        id="existing_server_name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Happy Server"
                        maxLength={22}
                        className="h-8 text-sm"
                    />
                    <p className="text-muted-foreground text-[10px]">
                        3–22 characters. Shown in the panel and txAdmin.
                    </p>
                </div>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="existing_data_folder">Data folder path</Label>
                <div className="flex gap-2">
                    <Input
                        id="existing_data_folder"
                        value={folder}
                        onChange={(e) => {
                            setFolder(e.target.value);
                            onDraftChange({
                                dataFolder: e.target.value,
                                localFolderValid: false,
                                localCfgValid: false,
                            });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleValidateFolder()}
                        placeholder="C:\FXServer\txData\MyServer"
                        className="h-8 flex-1 font-mono text-xs"
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant={draft.localFolderValid ? 'secondary' : 'default'}
                        onClick={() => handleValidateFolder()}
                        disabled={folderLoading || !folder.trim()}
                    >
                        {folderLoading ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                        ) : draft.localFolderValid ? (
                            <CheckIcon className="size-3.5" />
                        ) : (
                            'Validate'
                        )}
                    </Button>
                </div>
            </div>

            {suggestion && (
                <div className="border-warning/30 bg-warning/10 flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
                    <span>
                        Suggestion: <code className="font-mono text-[10px]">{suggestion}</code>
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={acceptSuggestion}
                    >
                        Use suggestion
                    </Button>
                </div>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="existing_cfg_file">server.cfg path</Label>
                <div className="flex gap-2">
                    <Input
                        id="existing_cfg_file"
                        value={cfgFile}
                        onChange={(e) => {
                            setCfgFile(e.target.value);
                            onDraftChange({ cfgFile: e.target.value, localCfgValid: false });
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && draft.localFolderValid && handleValidateCfg()}
                        placeholder="server.cfg"
                        disabled={!draft.localFolderValid}
                        className="h-8 flex-1 font-mono text-xs"
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant={draft.localCfgValid ? 'secondary' : 'default'}
                        onClick={handleValidateCfg}
                        disabled={cfgLoading || !cfgFile.trim() || !draft.localFolderValid}
                    >
                        {cfgLoading ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                        ) : draft.localCfgValid ? (
                            <CheckIcon className="size-3.5" />
                        ) : (
                            'Validate'
                        )}
                    </Button>
                </div>
                <p className="text-muted-foreground text-[10px]">Relative to the data folder, or absolute path.</p>
            </div>

            {draft.localFolderValid && draft.localCfgValid && (
                <p className={cn('text-success-inline text-xs')}>
                    Ready — save will register this server and open the console (no recipe deploy).
                </p>
            )}
        </div>
    );
}
