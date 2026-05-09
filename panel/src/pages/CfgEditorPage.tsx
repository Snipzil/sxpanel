import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import useSWR from 'swr';
import LazyMonacoEditor from '@/components/LazyMonacoEditor';
import MarkdownProse from '@/components/MarkdownProse';

type CfgDataResp = {
    rawFile?: string;
    cfgErrors?: string | null;
    error?: string;
};

type CfgFilesResp = {
    files?: string[];
    mainCfg?: string;
    name?: string;
    contents?: string;
    isMainCfg?: boolean;
    error?: string;
};

type CfgSaveResp = {
    type?: string;
    message?: string;
    markdown?: boolean;
    error?: string;
};

const SELECT_CLASS = 'bg-secondary text-secondary-foreground rounded-md border px-3 py-1.5 text-sm';

export default function CfgEditorPage() {
    const editorRef = useRef<any>(null);
    const [currentFile, setCurrentFile] = useState('');
    const [mainCfgName, setMainCfgName] = useState('');
    const [editorContent, setEditorContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingFile, setIsLoadingFile] = useState(false);

    const dataApi = useBackendApi<CfgDataResp>({
        method: 'GET',
        path: '/cfgEditor/data',
    });

    const filesApi = useBackendApi<CfgFilesResp>({
        method: 'GET',
        path: '/cfgEditor/files',
    });

    const saveApi = useBackendApi<CfgSaveResp>({
        method: 'POST',
        path: '/cfgEditor/save',
    });

    // Load initial data
    const { data: initialData, isLoading } = useSWR('/cfgEditor/data', () => {
        return new Promise<CfgDataResp>((resolve, reject) => {
            dataApi({
                success: (d) => resolve(d),
                error: (msg) => reject(new Error(msg)),
            });
        });
    });

    // Load file list
    const { data: filesData } = useSWR('/cfgEditor/files', () => {
        return new Promise<CfgFilesResp>((resolve, reject) => {
            filesApi({
                success: (d) => resolve(d),
                error: (msg) => reject(new Error(msg)),
            });
        });
    });

    // Set initial content when data loads
    useEffect(() => {
        if (initialData?.rawFile !== undefined) {
            setEditorContent(initialData.rawFile);
        }
    }, [initialData]);

    // Set current file and main name when file list loads
    useEffect(() => {
        if (filesData?.files?.length && filesData.mainCfg) {
            setMainCfgName(filesData.mainCfg);
            if (!currentFile) {
                setCurrentFile(filesData.mainCfg);
            }
        }
    }, [filesData, currentFile]);

    const handleFileChange = (fileName: string) => {
        if (!fileName || fileName === currentFile) return;
        setIsLoadingFile(true);
        filesApi({
            queryParams: { file: fileName },
            success(d) {
                setIsLoadingFile(false);
                if (d.contents !== undefined && d.name) {
                    setCurrentFile(d.name);
                    setEditorContent(d.contents);
                } else {
                    txToast.error('Failed to load file.');
                }
            },
            error() {
                setIsLoadingFile(false);
                txToast.error('Failed to load file.');
            },
        });
    };

    const handleSave = useCallback(() => {
        const cfgData = editorRef.current?.getValue() ?? editorContent;
        if (cfgData.length < 1024 && currentFile === mainCfgName) {
            txToast.warning(
                "Your CFG file is very small - there is a good chance you deleted something you shouldn't. A backup file will be saved just in case.",
            );
        }

        setIsSaving(true);
        saveApi({
            data: { cfgData, cfgFile: currentFile },
            success(d) {
                setIsSaving(false);
                if (d.type && d.message) {
                    if (d.markdown) {
                        txToast({
                            type: d.type as any,
                            msg: d.message,
                            md: true,
                        });
                    } else {
                        const toastType = d.type as 'success' | 'warning' | 'error' | 'info';
                        txToast[toastType]?.(d.message) ?? txToast.default(d.message);
                    }
                }
            },
            error(msg) {
                setIsSaving(false);
                txToast.error(msg);
            },
        });
    }, [editorContent, currentFile, mainCfgName]);

    // CTRL+S shortcut
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleSave]);

    if (isLoading) {
        return (
            <div className="flex min-h-96 items-center justify-center">
                <Loader2Icon className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    if (initialData?.error) {
        return (
            <div className="mx-auto w-full max-w-(--breakpoint-lg) px-2 md:px-0">
                <h1 className="mb-2 text-3xl">CFG Editor</h1>
                <div className="border-destructive/30 bg-destructive/10 rounded-lg border p-4 text-center">
                    {initialData.error}
                </div>
            </div>
        );
    }

    const fileHint =
        currentFile === mainCfgName
            ? '(main server config - validated on save)'
            : '(auxiliary config - saved without validation)';

    return (
        <div className="h-contentvh flex w-full flex-col gap-3 px-2 md:px-0">
            {/* CFG Errors Banner */}
            {initialData?.cfgErrors && (
                <div className="relative shrink-0 rounded-lg border border-[rgba(244,5,82,0.4)] bg-[rgba(244,5,82,0.15)] p-4">
                    <strong className="text-destructive">&#9888; Server failed to start due to config error(s):</strong>
                    <div className="mt-2 text-sm">
                        <MarkdownProse md={initialData.cfgErrors} isSmall />
                    </div>
                    <hr className="my-2 border-[rgba(244,5,82,0.3)]" />
                    <small className="text-muted-foreground">
                        Fix the issues above and save the file, then try starting the server again.
                    </small>
                </div>
            )}

            {/* File Picker */}
            <div className="flex shrink-0 items-center gap-3">
                <select
                    className={SELECT_CLASS}
                    style={{ maxWidth: 280 }}
                    value={currentFile}
                    onChange={(e) => handleFileChange(e.target.value)}
                    disabled={isLoadingFile}
                >
                    {filesData?.files?.map((f) => (
                        <option key={f} value={f}>
                            {f}
                        </option>
                    )) ?? <option value="">Loading...</option>}
                </select>
                <small className="text-muted-foreground whitespace-nowrap">{fileHint}</small>
            </div>

            {/* Monaco Editor */}
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
                <div className="absolute inset-0">
                    <LazyMonacoEditor
                        height="100%"
                        language="ini"
                        value={editorContent}
                        onChange={(value) => setEditorContent(value ?? '')}
                        onMount={(editor) => {
                            editorRef.current = editor;
                        }}
                        options={{
                            minimap: { enabled: false },
                            lineNumbers: 'on',
                            wordWrap: 'on',
                            scrollBeyondLastLine: false,
                            fontSize: 14,
                        }}
                    />
                </div>
            </div>

            {/* Save Button */}
            <div className="shrink-0 pb-2 text-center">
                <Button variant="outline" size="sm" disabled={isSaving} onClick={handleSave}>
                    {isSaving && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                    Save File (⌘+S/Ctrl+S)
                </Button>
            </div>
        </div>
    );
}
