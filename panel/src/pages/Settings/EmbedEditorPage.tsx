import { useState, useEffect } from 'react';
import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Save,
    RotateCcw,
    XIcon,
    Settings2Icon,
    Loader2Icon,
    PanelRightCloseIcon,
    PanelRightOpenIcon,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import TxAnchor from '@/components/TxAnchor';
import InlineCode from '@/components/InlineCode';
import { PageHeader } from '@/components/page-header';
import { useAtomValue, useSetAtom } from 'jotai';
import { embedEditorAtom } from './embedEditorState';
import { navigate } from 'wouter/use-browser-location';
import { ApiTimeout, useBackendApi } from '@/hooks/fetch';
import { txToast } from '@/components/TxToaster';
import jsonForgivingParse from '@shared/jsonForgivingParse';
import type { SaveConfigsResp, SaveConfigsReq } from '@shared/otherTypes';
import { emsg } from '@shared/emsg';

const beautifyJson = (json: string) => {
    try {
        return JSON.stringify(jsonForgivingParse(json), null, 4);
    } catch {
        return json;
    }
};

const placeholderDescriptions: Record<string, string> = {
    serverCfxId: 'The Cfx.re id of your server, this is tied to your `sv_licenseKey` and detected at runtime.',
    serverJoinUrl: 'The direct join URL of your server. Example: `https://cfx.re/join/xxxxxx`.',
    serverBrowserUrl:
        'The FiveM Server browser URL of your server. Example: `https://servers.fivem.net/servers/detail/xxxxxx`.',
    serverEndpoint: 'The live FXServer connect endpoint in `ip:port` form detected from the running server config.',
    serverIp: 'The host portion of the detected FXServer endpoint.',
    serverPort: 'The port portion of the detected FXServer endpoint.',
    serverConnectCommand: 'A ready-to-paste F8 command using the detected endpoint. Example: `connect 127.0.0.1:30120`.',
    serverAvailableSlots: 'How many open player slots are left based on the current online count and max clients.',
    serverClients: 'The number of players online in your server.',
    serverMaxClients: 'The `sv_maxclients` of your server, detected at runtime.',
    serverOccupancyPercent: 'The current player occupancy percentage, including the `%` suffix.',
    serverName: 'This is the fxPanel-given name for this server. Can be changed in `fxPanel > Settings > Global`.',
    statusColor: 'A hex-encoded color, from the Config JSON.',
    statusString: 'A text to be displayed with the server status, from the Config JSON.',
    uptime: 'For how long is the server online. Example: `1 hr, 50 mins`.',
    nextScheduledRestart: 'String with when is the next scheduled restart. Example: `in 2 hrs, 48 mins`.',
    recentJoinCount: 'How many player joins were recorded in the recent rolling window tracked by fxPanel.',
    recentLeaveCount: 'How many player leaves were recorded in the recent rolling window tracked by fxPanel.',
    playerList: 'A multiline rendered player list for the current page using the player line template from the Config JSON.',
    playerListColumns:
        'Expands a single embed field into compact inline roster columns for the current player-list page.',
    playerListInline: 'A compact rendered player list for the current page using the inline player template from the Config JSON.',
    playerListSummary: 'A short summary of how many players are online right now.',
    playerListPage: 'The current 1-based player-list page number.',
    playerListTotalPages: 'The total amount of available player-list pages.',
    playerListPageSummary: 'A short summary of the current player-list page range. Example: `Page 2/3 • Showing 31-60`.',
};

const playerTemplatePlaceholderDescriptions: Record<string, string> = {
    index: '1-based player position in the rendered list.',
    netid: 'The player network id.',
    displayName: 'The current display name shown in the fxPanel player list.',
    pureName: 'The raw player name before tag decorations.',
    license: 'The player license identifier.',
    playTimeMinutes: 'The player playtime stored by fxPanel, in minutes.',
    playTime: 'A human-readable version of the player playtime stored by fxPanel. Example: `48 mins`.',
    sessionTimeSeconds: 'How many seconds the player has been connected in the current server session.',
    sessionTimeMinutes: 'How many minutes the player has been connected in the current server session.',
    sessionTime: 'A human-readable session duration for the player. Example: `1 hr, 16 mins`.',
    tags: 'The player tags computed by fxPanel, joined by commas.',
};

export default function EmbedEditorPage() {
    const editorState = useAtomValue(embedEditorAtom);
    const setEditorState = useSetAtom(embedEditorAtom);
    const [config, setConfig] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const saveApi = useBackendApi<SaveConfigsResp, SaveConfigsReq>({
        method: 'POST',
        path: '/settings/configs/:card',
        throwGenericErrors: true,
    });

    // Initialize editor content once on mount, so subsequent atom updates
    // don't clobber unsaved edits.
    useEffect(() => {
        if (editorState) {
            setConfig(beautifyJson(editorState.initialValue));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Redirect if no state
    useEffect(() => {
        if (!editorState) {
            navigate('/settings#discord');
        }
    }, [editorState]);

    // Validate JSON on change
    useEffect(() => {
        try {
            jsonForgivingParse(config);
            setError(null);
        } catch (e) {
            setError('Invalid JSON: ' + emsg(e));
        }
    }, [config]);

    if (!editorState) return null;

    const embedLabel = editorState.fieldLabel.toLowerCase().includes('player list')
        ? 'player list embed'
        : 'status embed';
    const showsPlayerTemplatePlaceholders =
        editorState.field === 'embedConfigJson' || editorState.field === 'playerListEmbedConfigJson';
    const showsPlayerListConfigHints = editorState.field === 'playerListEmbedConfigJson';

    const handleSave = async () => {
        if (error || isSaving) return;
        const toastId = txToast.loading('Saving embed settings...', { id: 'embedSave' });
        setIsSaving(true);
        try {
            const changes = {
                discordBot: {
                    [editorState.field]: config,
                },
            };
            const resp = await saveApi({
                pathParams: { card: 'discord-bot' },
                data: { resetKeys: [], changes },
                timeout: ApiTimeout.LONG,
                toastId,
            });
            if (!resp) throw new Error('empty_response');
            if (resp.type === 'error') return;
            // Update the atom with the saved value so going back reflects changes
            setEditorState({
                ...editorState,
                initialValue: config,
            });
            navigate('/settings#discord');
        } catch (error) {
            txToast.error(
                {
                    title: 'Error saving embed:',
                    msg: emsg(error),
                },
                { id: toastId },
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        navigate('/settings#discord');
    };

    return (
        <div className="max-h-contentvh flex h-full w-full flex-col">
            <PageHeader
                icon={<Settings2Icon />}
                title={editorState.fieldLabel}
                parentName="Settings"
                parentLink="/settings#discord"
            />
            <div className="xs:px-3 mx-auto flex min-h-0 w-full grow flex-col px-0 md:px-0">
                {/* Description + Placeholders toggle */}
                <div className="mb-4 flex-none space-y-2">
                    <div className="flex items-start justify-between">
                        <p className="text-muted-foreground">
                            The {embedLabel} is customizable by editing the JSON below. <br />
                            You can use the placeholders to include dynamic server information in the embed, button
                            URLs, and player line templates. <br />
                            For information refer to <TxAnchor href="https://fxpanel.org/docs">our docs</TxAnchor>.
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsPanelOpen(!isPanelOpen)}
                            className="ml-4 flex-none"
                        >
                            {isPanelOpen ? 'Hide Placeholders' : 'Show Placeholders'}
                            {isPanelOpen ? (
                                <PanelRightCloseIcon className="ml-2 h-4 w-4" />
                            ) : (
                                <PanelRightOpenIcon className="ml-2 h-4 w-4" />
                            )}
                        </Button>
                    </div>
                    {showsPlayerListConfigHints && (
                        <Alert>
                            <AlertDescription>
                                Player-list paging and compact columns are configured in the Config JSON with
                                <InlineCode>playerColumnCount</InlineCode>, <InlineCode>playersPerColumn</InlineCode>,
                                <InlineCode>playerColumnTemplate</InlineCode>, <InlineCode>showPagerButtons</InlineCode>,
                                and <InlineCode>pagerPageLabelTemplate</InlineCode>.
                            </AlertDescription>
                        </Alert>
                    )}
                </div>

                {/* Editor + Placeholders side by side */}
                <div className="flex min-h-0 flex-1 gap-4">
                    {/* Monaco Editor */}
                    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-[#1E1E1E]">
                        <LazyMonacoEditor
                            height="100%"
                            defaultLanguage="json"
                            value={config}
                            onChange={(value) => setConfig(value || '')}
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                lineNumbers: 'on',
                                scrollBeyondLastLine: false,
                                wordWrap: 'on',
                            }}
                        />
                    </div>

                    {/* Placeholders panel */}
                    {isPanelOpen && (
                        <div className="bg-card min-h-0 w-96 flex-none overflow-hidden rounded-xl border">
                            <ScrollArea className="h-full">
                                <div className="space-y-2 p-4">
                                    <h3 className="text-lg font-semibold">Available Placeholders</h3>
                                    <ul className="space-y-4">
                                        {Object.entries(placeholderDescriptions).map(([pString, pDesc]) => (
                                            <li key={pString}>
                                                <InlineCode className="text-secondary-foreground bg-secondary/50 mb-1 block rounded-md border py-1">
                                                    {`{{${pString}}}`}
                                                </InlineCode>
                                                <span className="text-muted-foreground text-sm">{pDesc}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    {showsPlayerTemplatePlaceholders && (
                                        <>
                                            <h3 className="pt-3 text-lg font-semibold">Player Line Placeholders</h3>
                                            <ul className="space-y-4">
                                                {Object.entries(playerTemplatePlaceholderDescriptions).map(
                                                    ([pString, pDesc]) => (
                                                        <li key={pString}>
                                                            <InlineCode className="text-secondary-foreground bg-secondary/50 mb-1 block rounded-md border py-1">
                                                                {`{{${pString}}}`}
                                                            </InlineCode>
                                                            <span className="text-muted-foreground text-sm">
                                                                {pDesc}
                                                            </span>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-4 mb-6 flex-none">
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <div className="flex flex-wrap justify-between gap-2">
                        <Button variant="outline" onClick={handleBack}>
                            Back to Settings
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setConfig(beautifyJson(editorState.initialValue))}>
                                <XIcon className="mr-2 h-4 w-4" /> Discard Changes
                            </Button>
                            <Button
                                variant="outline"
                                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => setConfig(beautifyJson(editorState.defaultValue))}
                            >
                                <RotateCcw className="mr-2 h-4 w-4" /> Reset to Default
                            </Button>
                            <Button onClick={handleSave} disabled={!!error || isSaving}>
                                {isSaving ? (
                                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
