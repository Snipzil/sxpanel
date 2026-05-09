import { atom, useSetAtom } from 'jotai';
import { navigate } from 'wouter/use-browser-location';
import type { DiscordLogRouteConfig } from '@shared/discordLogRoutes';

export type DiscordLogRoutesEditorState = {
    initialValue: DiscordLogRouteConfig[];
    defaultValue: DiscordLogRouteConfig[];
    warningsChannel: string | null;
    defaultWarningsChannel: string | null;
    logGuildOverride: string | null;
    defaultLogGuildOverride: string | null;
    mainGuildId?: string;
};

export const discordLogRoutesEditorAtom = atom<DiscordLogRoutesEditorState | null>(null);

export const useOpenDiscordLogRoutesEditor = () => {
    const setEditorState = useSetAtom(discordLogRoutesEditorAtom);
    return (state: DiscordLogRoutesEditorState) => {
        setEditorState(state);
        navigate('/settings/discord-logs');
    };
};