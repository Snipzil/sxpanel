import { atom, useAtomValue, useSetAtom } from 'jotai';
import { fetchWebPipe } from '../utils/fetchWebPipe';
import { debugLog } from '../utils/debugLog';
import { MockedPlayerDetails } from '../utils/constants';
import { PlayerData } from '@nui/src/hooks/usePlayerListListener';
import { PlayerModalResp, PlayerModalSuccess } from '@shared/playerApiTypes';
import { GenericApiErrorResp } from '@shared/genericApiTypes';

const forcePlayerRefreshAtom = atom(0);

const associatedPlayerAtom = atom<PlayerData | null>(null);

const selectedPlayerDataAtom = atom<Promise<PlayerModalResp | undefined>>(async (get) => {
    get(forcePlayerRefreshAtom);
    const assocPlayer = get(associatedPlayerAtom);
    if (!assocPlayer) return;
    const assocPlayerId = assocPlayer.id;

    const res: any = await fetchWebPipe<PlayerModalResp>(`/player?mutex=current&netid=${assocPlayerId}`, {
        mockData: MockedPlayerDetails,
    });
    debugLog('FetchWebPipe', res, 'PlayerFetch');

    if (res.error) {
        return { error: (res as GenericApiErrorResp).error };
    } else if (res.player) {
        const player = (res as PlayerModalSuccess).player;
        if (player.isConnected) {
            return res;
        } else {
            return { error: 'This player is no longer connected to the server.' };
        }
    } else {
        return { error: 'Unknown error :(' };
    }
});

export const usePlayerDetailsValue = () =>
    (useAtomValue(selectedPlayerDataAtom) ?? { error: 'No player selected.' }) as PlayerModalResp;

export const useForcePlayerRefresh = () => useSetAtom(forcePlayerRefreshAtom);

export const useAssociatedPlayerValue = () => useAtomValue(associatedPlayerAtom) as PlayerData;

export const useSetAssociatedPlayer = () => useSetAtom(associatedPlayerAtom);
