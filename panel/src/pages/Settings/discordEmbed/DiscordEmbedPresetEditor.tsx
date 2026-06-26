import type { DiscordEmbedConfigDraft, DiscordEmbedDraft } from '@shared/discordEmbedDraft/types';
import type { EmbedEditorVariant } from '../embedEditorState';
import { DiscordEmbedPlaceholdersList } from './DiscordEmbedPlaceholdersList';
import { DiscordEmbedContentSection } from './DiscordEmbedContentSection';
import { DiscordEmbedFieldsEditor } from './DiscordEmbedFieldsEditor';
import { DiscordEmbedConfigSection } from './DiscordEmbedConfigSection';
import { DiscordEmbedButtonsEditor } from './DiscordEmbedButtonsEditor';

type DiscordEmbedPresetEditorProps = {
    variant: EmbedEditorVariant;
    embed: DiscordEmbedDraft;
    config: DiscordEmbedConfigDraft;
    onEmbedChange: (embed: DiscordEmbedDraft) => void;
    onConfigChange: (config: DiscordEmbedConfigDraft) => void;
};

export function DiscordEmbedPresetEditor({
    variant,
    embed,
    config,
    onEmbedChange,
    onConfigChange,
}: DiscordEmbedPresetEditorProps) {
    return (
        <div className="flex flex-col gap-3">
            <DiscordEmbedPlaceholdersList variant={variant} />
            <DiscordEmbedContentSection embed={embed} onChange={onEmbedChange} />
            <DiscordEmbedFieldsEditor embed={embed} onChange={onEmbedChange} />
            <DiscordEmbedConfigSection variant={variant} config={config} onChange={onConfigChange} />
            <DiscordEmbedButtonsEditor config={config} onChange={onConfigChange} />
        </div>
    );
}
