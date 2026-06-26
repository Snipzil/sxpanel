import { atom, useSetAtom } from 'jotai';
import { navigate } from 'wouter/use-browser-location';

export type EmbedEditorVariant = 'status' | 'playerList';

export type EmbedEditorState = {
    variant: EmbedEditorVariant;
    embedJson: string;
    embedConfigJson: string;
    initialEmbedJson: string;
    initialEmbedConfigJson: string;
    defaultEmbedJson: string;
    defaultEmbedConfigJson: string;
};

export const embedEditorAtom = atom<EmbedEditorState | null>(null);

export const embedEditorVariantPath = (variant: EmbedEditorVariant) =>
    variant === 'status' ? '/settings/discord-embed/status' : '/settings/discord-embed/player-list';

export const parseEmbedEditorVariantParam = (param: string | undefined): EmbedEditorVariant | null => {
    if (param === 'status') return 'status';
    if (param === 'player-list') return 'playerList';
    return null;
};

export const useOpenEmbedEditor = () => {
    const setEditorState = useSetAtom(embedEditorAtom);
    return (state: EmbedEditorState) => {
        setEditorState(state);
        navigate(embedEditorVariantPath(state.variant));
    };
};
