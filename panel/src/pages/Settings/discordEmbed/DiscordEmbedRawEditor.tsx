import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';
import { useLocale } from '@/hooks/locale';

type DiscordEmbedRawEditorProps = {
    embedJson: string;
    embedConfigJson: string;
    onEmbedJsonChange: (value: string) => void;
    onEmbedConfigJsonChange: (value: string) => void;
};

const monacoOptions = {
    automaticLayout: true,
    minimap: { enabled: false },
    lineNumbers: 'on' as const,
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    fontSize: 14,
};

function RawJsonPane({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-[#1E1E1E]">
            <p className="text-muted-foreground shrink-0 border-b px-3 py-2 text-xs font-medium">{label}</p>
            <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0">
                    <LazyMonacoEditor
                        height="100%"
                        defaultLanguage="json"
                        value={value}
                        onChange={(next) => onChange(next || '')}
                        options={monacoOptions}
                    />
                </div>
            </div>
        </div>
    );
}

export function DiscordEmbedRawEditor({
    embedJson,
    embedConfigJson,
    onEmbedJsonChange,
    onEmbedConfigJsonChange,
}: DiscordEmbedRawEditorProps) {
    const { t } = useLocale();

    return (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3">
            <RawJsonPane
                label={t('panel.settings.embed_editor.raw_embed_json')}
                value={embedJson}
                onChange={onEmbedJsonChange}
            />
            <RawJsonPane
                label={t('panel.settings.embed_editor.raw_config_json')}
                value={embedConfigJson}
                onChange={onEmbedConfigJsonChange}
            />
        </div>
    );
}
