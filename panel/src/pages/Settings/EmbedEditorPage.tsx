import { useEffect, useMemo, useState } from 'react';
import { useRoute } from 'wouter';
import { navigate } from 'wouter/use-browser-location';
import { useAtomValue, useSetAtom } from 'jotai';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DiscordCardPreview } from '@/components/discord/DiscordCardPreview';
import { useLocale } from '@/hooks/locale';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import { buildDiscordEmbedPreview } from '@shared/discordEmbedPreview/buildPreview';
import type { PreviewHealth } from '@shared/discordEmbedPreview/mockPlaceholders';
import { tryParseEmbedDrafts } from '@shared/discordEmbedDraft/parse';
import {
    serializeEmbedConfigJson,
    serializeEmbedJson,
    beautifyEmbedJsonPair,
} from '@shared/discordEmbedDraft/serialize';
import type { DiscordEmbedConfigDraft, DiscordEmbedDraft } from '@shared/discordEmbedDraft/types';
import type { SaveConfigsResp, SaveConfigsReq } from '@shared/otherTypes';
import { emsg } from '@shared/emsg';
import { embedEditorAtom, embedEditorVariantPath, parseEmbedEditorVariantParam } from './embedEditorState';
import { DiscordEmbedPresetEditor } from './discordEmbed/DiscordEmbedPresetEditor';
import { DiscordEmbedRawEditor } from './discordEmbed/DiscordEmbedRawEditor';
import { LayoutTemplateIcon, Save, RotateCcw, XIcon, Wand2, Code2, Loader2Icon } from 'lucide-react';
import jsonForgivingParse from '@shared/jsonForgivingParse';

type EditorMode = 'preset' | 'raw';

const parseRawJson = (json: string) => {
    jsonForgivingParse(json);
};

export default function EmbedEditorPage() {
    const { t } = useLocale();
    const [, params] = useRoute('/settings/discord-embed/:variant');
    const routeVariant = parseEmbedEditorVariantParam(params?.variant);
    const editorState = useAtomValue(embedEditorAtom);
    const setEditorState = useSetAtom(embedEditorAtom);

    const [editorMode, setEditorMode] = useState<EditorMode>('preset');
    const [embedJson, setEmbedJson] = useState('');
    const [embedConfigJson, setEmbedConfigJson] = useState('');
    const [embedDraft, setEmbedDraft] = useState<DiscordEmbedDraft | null>(null);
    const [configDraft, setConfigDraft] = useState<DiscordEmbedConfigDraft | null>(null);
    const [previewHealth, setPreviewHealth] = useState<PreviewHealth>('online');
    const [isSaving, setIsSaving] = useState(false);

    const debouncedEmbedJson = useDebouncedValue(embedJson, 150);
    const debouncedEmbedConfigJson = useDebouncedValue(embedConfigJson, 150);

    const saveApi = useBackendApi<SaveConfigsResp, SaveConfigsReq>({
        method: 'POST',
        path: '/settings/configs/:card',
        throwGenericErrors: true,
    });

    useEffect(() => {
        if (!editorState) {
            navigate('/settings#discord');
            return;
        }
        if (routeVariant && editorState.variant !== routeVariant) {
            navigate(embedEditorVariantPath(editorState.variant));
            return;
        }
        setEmbedJson(editorState.embedJson);
        setEmbedConfigJson(editorState.embedConfigJson);
        const parsed = tryParseEmbedDrafts(editorState.embedJson, editorState.embedConfigJson);
        if (parsed.ok) {
            setEmbedDraft(parsed.embed);
            setConfigDraft(parsed.config);
            setEditorMode('preset');
        } else {
            setEmbedDraft(null);
            setConfigDraft(null);
            setEditorMode('raw');
        }
    }, [editorState, routeVariant]);

    const rawJsonError = useMemo(() => {
        try {
            parseRawJson(embedJson);
            parseRawJson(embedConfigJson);
            return null;
        } catch (e) {
            return t('panel.settings.embed_editor.invalid_json', { error: emsg(e) });
        }
    }, [embedJson, embedConfigJson, t]);

    const previewResult = useMemo(() => {
        if (rawJsonError) {
            return { error: t('panel.settings.embed_editor.preview_invalid_json') };
        }
        if (!editorState) return {};
        return buildDiscordEmbedPreview({
            embedJson: debouncedEmbedJson,
            embedConfigJson: debouncedEmbedConfigJson,
            variant: editorState.variant,
            health: editorState.variant === 'status' ? previewHealth : undefined,
        });
    }, [debouncedEmbedConfigJson, debouncedEmbedJson, editorState, previewHealth, rawJsonError, t]);

    const syncDraftsToJson = (embed: DiscordEmbedDraft, config: DiscordEmbedConfigDraft, pretty = true) => {
        setEmbedDraft(embed);
        setConfigDraft(config);
        setEmbedJson(serializeEmbedJson(embed, pretty));
        setEmbedConfigJson(serializeEmbedConfigJson(config, pretty));
    };

    const handleEmbedDraftChange = (embed: DiscordEmbedDraft) => {
        if (!configDraft) return;
        syncDraftsToJson(embed, configDraft);
    };

    const handleConfigDraftChange = (config: DiscordEmbedConfigDraft) => {
        if (!embedDraft) return;
        syncDraftsToJson(embedDraft, config);
    };

    const handleSwitchToPreset = () => {
        const parsed = tryParseEmbedDrafts(embedJson, embedConfigJson);
        if (!parsed.ok) {
            txToast.error({
                title: t('panel.settings.embed_editor.raw_parse_error_title'),
                msg: parsed.error,
            });
            return;
        }
        syncDraftsToJson(parsed.embed, parsed.config);
        setEditorMode('preset');
    };

    const handleSwitchToRaw = () => {
        if (embedDraft && configDraft) {
            setEmbedJson(serializeEmbedJson(embedDraft, true));
            setEmbedConfigJson(serializeEmbedConfigJson(configDraft, true));
        }
        setEditorMode('raw');
    };

    const handleLoadStored = () => {
        if (!editorState) return;
        const pretty = beautifyEmbedJsonPair(editorState.initialEmbedJson, editorState.initialEmbedConfigJson);
        setEmbedJson(pretty.embedJson);
        setEmbedConfigJson(pretty.embedConfigJson);
        const parsed = tryParseEmbedDrafts(pretty.embedJson, pretty.embedConfigJson);
        if (parsed.ok) {
            setEmbedDraft(parsed.embed);
            setConfigDraft(parsed.config);
        } else {
            setEmbedDraft(null);
            setConfigDraft(null);
            setEditorMode('raw');
        }
    };

    const handleResetFactory = () => {
        if (!editorState) return;
        const pretty = beautifyEmbedJsonPair(editorState.defaultEmbedJson, editorState.defaultEmbedConfigJson);
        setEmbedJson(pretty.embedJson);
        setEmbedConfigJson(pretty.embedConfigJson);
        const parsed = tryParseEmbedDrafts(pretty.embedJson, pretty.embedConfigJson);
        if (parsed.ok) {
            setEmbedDraft(parsed.embed);
            setConfigDraft(parsed.config);
        } else {
            setEmbedDraft(null);
            setConfigDraft(null);
            setEditorMode('raw');
        }
    };

    const handleSave = async () => {
        if (!editorState || rawJsonError || isSaving) return;
        const toastId = txToast.loading(t('panel.settings.embed_editor.saving'), { id: 'embedSave' });
        setIsSaving(true);
        try {
            const changes =
                editorState.variant === 'status'
                    ? {
                          discordBot: {
                              embedJson,
                              embedConfigJson,
                          },
                      }
                    : {
                          discordBot: {
                              playerListEmbedJson: embedJson,
                              playerListEmbedConfigJson: embedConfigJson,
                          },
                      };
            const resp = await saveApi({
                pathParams: { card: 'discord' },
                data: { resetKeys: [], changes },
                timeout: ApiTimeout.LONG,
                toastId,
            });
            if (!resp) throw new Error('empty_response');
            if (resp.type === 'error') return;
            setEditorState({
                ...editorState,
                embedJson,
                embedConfigJson,
                initialEmbedJson: embedJson,
                initialEmbedConfigJson: embedConfigJson,
            });
            navigate('/settings#discord');
        } catch (error) {
            txToast.error(
                {
                    title: t('panel.settings.embed_editor.save_error_title'),
                    msg: emsg(error),
                },
                { id: toastId },
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (!editorState) return null;
    if (editorMode === 'preset' && (!embedDraft || !configDraft)) return null;

    const pageTitle =
        editorState.variant === 'status'
            ? t('panel.settings.embed_editor.page_title_status')
            : t('panel.settings.embed_editor.page_title_player_list');

    return (
        <div className="max-h-contentvh flex h-full min-h-0 w-full flex-col gap-2">
            <PageHeader
                icon={<LayoutTemplateIcon />}
                title={pageTitle}
                parentName={t('panel.settings.embed_editor.parent_settings')}
                parentLink="/settings#discord"
            />

            <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={editorMode === 'preset' ? 'default' : 'outline'}
                    onClick={handleSwitchToPreset}
                >
                    <Wand2 className="mr-1.5 size-4" />
                    {t('panel.settings.embed_editor.mode_preset')}
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={editorMode === 'raw' ? 'default' : 'outline'}
                    onClick={handleSwitchToRaw}
                >
                    <Code2 className="mr-1.5 size-4" />
                    {t('panel.settings.embed_editor.mode_raw')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleLoadStored}>
                    {t('panel.settings.embed_editor.load_stored')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleResetFactory}>
                    <RotateCcw className="mr-1.5 size-4" />
                    {t('panel.settings.embed_editor.reset_factory')}
                </Button>
                <div className="ml-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/settings#discord')}>
                        {t('panel.settings.embed_editor.back_settings')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleLoadStored}>
                        <XIcon className="mr-1.5 size-4" />
                        {t('panel.settings.embed_editor.discard_changes')}
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={!!rawJsonError || isSaving}>
                        {isSaving ? (
                            <Loader2Icon className="mr-1.5 size-4 animate-spin" />
                        ) : (
                            <Save className="mr-1.5 size-4" />
                        )}
                        {t('panel.settings.embed_editor.save_changes')}
                    </Button>
                </div>
            </div>

            {rawJsonError ? (
                <Alert variant="destructive" className="shrink-0 py-2">
                    <AlertDescription>{rawJsonError}</AlertDescription>
                </Alert>
            ) : null}

            <div className="shell-xl:flex-row shell-xl:gap-6 flex min-h-0 flex-1 flex-col gap-4">
                {editorMode === 'preset' ? (
                    <ScrollArea className="h-full min-h-0 flex-1">
                        <div className="pr-3 pb-2">
                            <DiscordEmbedPresetEditor
                                variant={editorState.variant}
                                embed={embedDraft!}
                                config={configDraft!}
                                onEmbedChange={handleEmbedDraftChange}
                                onConfigChange={handleConfigDraftChange}
                            />
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <DiscordEmbedRawEditor
                            embedJson={embedJson}
                            embedConfigJson={embedConfigJson}
                            onEmbedJsonChange={setEmbedJson}
                            onEmbedConfigJsonChange={setEmbedConfigJson}
                        />
                    </div>
                )}

                <div className="border-border bg-muted/15 shell-xl:min-h-0 shell-xl:max-w-[28rem] shell-xl:shrink-0 flex min-h-[min(480px,50vh)] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border">
                    <div className="border-border/60 flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
                        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                            {t('panel.settings.embed_editor.live_preview')}
                        </span>
                        {editorState.variant === 'status' ? (
                            <div className="ml-auto flex flex-wrap gap-1">
                                {(['online', 'partial', 'offline'] as const).map((health) => (
                                    <Button
                                        key={health}
                                        type="button"
                                        size="sm"
                                        variant={previewHealth === health ? 'default' : 'outline'}
                                        className="h-7 px-2 text-xs"
                                        onClick={() => setPreviewHealth(health)}
                                    >
                                        {t(`panel.settings.embed_editor.preview_health_${health}`)}
                                    </Button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <DiscordCardPreview
                        className="min-h-0 flex-1 p-3"
                        payload={previewResult.payload}
                        error={previewResult.error}
                        sampleNote={t('panel.settings.embed_editor.preview_sample_note')}
                    />
                </div>
            </div>
        </div>
    );
}
