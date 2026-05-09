import { atom, useAtomValue, useSetAtom } from 'jotai';
import { navigate } from 'wouter/use-browser-location';

export type EmbedEditorState = {
    field: 'embedJson' | 'embedConfigJson' | 'playerListEmbedJson' | 'playerListEmbedConfigJson';
    fieldLabel: string;
    initialValue: string;
    defaultValue: string;
};

export const embedEditorAtom = atom<EmbedEditorState | null>(null);

export const useOpenEmbedEditor = () => {
    const setEditorState = useSetAtom(embedEditorAtom);
    return (state: EmbedEditorState) => {
        setEditorState(state);
        navigate('/settings/embed-editor');
    };
};
