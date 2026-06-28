import { LocaleType } from '@shared/localeMap';
import type { TagDefinition } from '@shared/socketioTypes';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import config from '../utils/config.json';

interface OneSyncCtx {
    type: null | string;
    status: boolean;
}

export interface ServerCtx {
    oneSync: OneSyncCtx;
    projectName: null | string;
    maxClients: number;
    locale: string;
    localeData: LocaleType | boolean;
    switchPageKey: string;
    announceNotiPos: string;
    sxPanelVersion: string;
    alignRight: boolean;
    tagDefinitions: TagDefinition[];
    reportsEnabled: boolean;
}

const serverCtx = atom<ServerCtx>(config.serverCtx);

export const useServerCtxValue = () => useAtomValue(serverCtx);

export const useSetServerCtx = () => useSetAtom(serverCtx);

interface AnnounceNotiLocation {
    vertical: 'top' | 'bottom';
    horizontal: 'left' | 'right' | 'center';
}

const verifyNotiLocation = (pos: { vertical: string; horizontal: string }) => {
    if (pos.vertical !== 'top' && pos.vertical !== 'bottom') {
        throw new Error(`Notification vertical position must be "top" or "bottom", but got ${pos.vertical}`);
    }

    if (pos.horizontal !== 'left' && pos.horizontal !== 'right' && pos.horizontal !== 'center') {
        throw new Error(
            `Notification horizontal position must be "left", "right" or "center", but got ${pos.horizontal}`,
        );
    }

    return pos as AnnounceNotiLocation;
};

const notiLocationAtom = atom<AnnounceNotiLocation>((get) => {
    const notiTgtRaw = get(serverCtx).announceNotiPos;
    const [vertical, horizontal] = notiTgtRaw.split('-');

    try {
        return verifyNotiLocation({ vertical, horizontal });
    } catch (e) {
        console.error(e);
        return { vertical: 'top', horizontal: 'center' } satisfies AnnounceNotiLocation;
    }
});

export const useAnnounceNotiPosValue = () => useAtomValue(notiLocationAtom);
