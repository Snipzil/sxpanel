import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangleIcon, FileCogIcon, Loader2Icon, SaveIcon } from 'lucide-react';
import useSWR from 'swr';
import { useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';
import MarkdownProse from '@/components/MarkdownProse';
import { useLocale } from '@/hooks/locale';
import { cn } from '@/lib/utils';

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

type EditorViewState = {
    currentFile: string;
    mainCfgName: string;
    editorContent: string;
    isLoadingFile: boolean;
};

/**
 * CFG Editor V2 — redesign goals over V1:
 * - V2 header band (icon tile + title + file hint) with the file picker and
 *   a primary Save action surfaced in the band instead of a native select
 *   and a centered outline button at the bottom.
 * - Token-based error banner (`border-destructive/40 bg-destructive/10`,
 *   `role="alert"`) replacing the hardcoded rgba(244,5,82,…) styles.
 * - shadcn Select with an accessible label, `rounded-xl` editor card shell.
 */
export default function CfgEditorPage() {
    const { t } = useLocale();
    const editorRef = useRef<any>(null);
    const [editorState, setEditorState] = useState<EditorViewState>({
        currentFile: '',
        mainCfgName: '',
        editorContent: '',
        isLoadingFile: false,
    });
    const [isSaving, setIsSaving] = useState(false);
    const { currentFile, mainCfgName, editorContent, isLoadingFile } = editorState;

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
        const rawFile = initialData?.rawFile;
        if (rawFile !== undefined) {
            setEditorState((prev) => ({ ...prev, editorContent: rawFile }));
        }
    }, [initialData]);

    // Set current file and main name when file list loads
    useEffect(() => {
        if (filesData?.files?.length && filesData.mainCfg) {
            setEditorState((prev) => ({
                ...prev,
                mainCfgName: filesData.mainCfg!,
                currentFile: prev.currentFile || filesData.mainCfg!,
            }));
        }
    }, [filesData]);

    const handleFileChange = (fileName: string) => {
        if (!fileName || fileName === currentFile) return;
        setEditorState((prev) => ({ ...prev, isLoadingFile: true }));
        filesApi({
            queryParams: { file: fileName },
            success(d) {
                const { contents, name } = d;
                if (contents !== undefined && name) {
                    setEditorState((prev) => ({
                        ...prev,
                        currentFile: name,
                        editorContent: contents,
                        isLoadingFile: false,
                    }));
                } else {
                    setEditorState((prev) => ({ ...prev, isLoadingFile: false }));
                    txToast.error(t('panel.cfg.load_failed'));
                }
            },
            error() {
                setEditorState((prev) => ({ ...prev, isLoadingFile: false }));
                txToast.error(t('panel.cfg.load_failed'));
            },
        });
    };

    const handleSave = useCallback(() => {
        const cfgData = editorRef.current?.getValue() ?? editorContent;
        if (cfgData.length < 1024 && currentFile === mainCfgName) {
            txToast.warning(t('panel.cfg.small_file_warning'));
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
    }, [editorContent, currentFile, mainCfgName, t]);

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

    const fileHint = currentFile === mainCfgName ? t('panel.cfg.hint_main') : t('panel.cfg.hint_aux');

    if (isLoading) {
        return (
            <div className="text-muted-foreground flex min-h-96 items-center justify-center">
                <Loader2Icon className="size-8 animate-spin" />
            </div>
        );
    }

    if (initialData?.error) {
        return (
            <div className="mx-auto w-full max-w-(--tx-page-max-width) px-2 md:px-0">
                <HeaderBand title={t('panel.cfg.title')} hint={null} />
                <div
                    className="border-destructive/40 bg-destructive/10 flex items-center justify-center gap-2 rounded-xl border p-6 text-center"
                    role="alert"
                >
                    <AlertTriangleIcon className="text-destructive-inline size-5 shrink-0" />
                    <span className="text-destructive-inline text-sm">{initialData.error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-contentvh flex w-full min-w-96 flex-col gap-3 px-2 md:px-0">
            {/* Header band */}
            <HeaderBand title={t('panel.cfg.title')} hint={fileHint}>
                <div className="flex flex-wrap items-center gap-2">
                    <Select value={currentFile} onValueChange={handleFileChange} disabled={isLoadingFile}>
                        <SelectTrigger className="w-64 max-w-full" aria-label="Config file to edit">
                            {isLoadingFile ? (
                                <span className="text-muted-foreground inline-flex items-center gap-2">
                                    <Loader2Icon className="size-3.5 animate-spin" />
                                    {t('panel.cfg.loading_files')}
                                </span>
                            ) : (
                                <SelectValue placeholder={t('panel.cfg.loading_files')} />
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {filesData?.files?.map((f) => (
                                <SelectItem key={f} value={f}>
                                    <span className={cn(f === mainCfgName && 'font-semibold')}>{f}</span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button size="sm" disabled={isSaving} onClick={handleSave}>
                        {isSaving ? (
                            <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                        ) : (
                            <SaveIcon className="mr-1.5 size-4" />
                        )}
                        {t('panel.cfg.save_shortcut')}
                    </Button>
                </div>
            </HeaderBand>

            {/* CFG Errors Banner */}
            {initialData?.cfgErrors && (
                <div className="border-destructive/40 bg-destructive/10 shrink-0 rounded-xl border p-4" role="alert">
                    <div className="text-destructive-inline flex items-center gap-2 font-semibold">
                        <AlertTriangleIcon className="size-4 shrink-0" />
                        {t('panel.cfg.errors_banner')}
                    </div>
                    <div className="mt-2 text-sm">
                        <MarkdownProse md={initialData.cfgErrors} isSmall />
                    </div>
                    <hr className="border-destructive/20 my-2" />
                    <small className="text-muted-foreground">{t('panel.cfg.errors_hint')}</small>
                </div>
            )}

            {/* Monaco Editor */}
            <div className="border-border/60 relative min-h-0 flex-1 overflow-hidden rounded-xl border shadow-sm">
                <div className="absolute inset-0">
                    <LazyMonacoEditor
                        height="100%"
                        language="ini"
                        value={editorContent}
                        onChange={(value) => setEditorState((prev) => ({ ...prev, editorContent: value ?? '' }))}
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
        </div>
    );
}

function HeaderBand({ title, hint, children }: { title: string; hint: string | null; children?: React.ReactNode }) {
    return (
        <div className="border-border/60 bg-card shrink-0 rounded-xl border shadow-sm">
            <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <FileCogIcon className="text-foreground size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">{title}</h1>
                        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
                    </div>
                </div>
                {children}
            </div>
        </div>
    );
}
