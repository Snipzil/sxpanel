import { usePushPlayerDropEvent } from '@/pages/Dashboard/dashboardAtoms';
import { globalStatusAtom } from '@/hooks/status';
import { PlayerlistEventType, PlayerlistPlayerType, TagDefinition } from '@shared/socketioTypes';
import { atom, useSetAtom } from 'jotai';

/**
 * Atoms
 */
export const playerlistAtom = atom<PlayerlistPlayerType[]>([]);
export const playerCountAtom = atom((get) => {
    const listCount = get(playerlistAtom).length;
    const statusCount = get(globalStatusAtom)?.server.playerCount;
    if (typeof statusCount === 'number') return Math.max(listCount, statusCount);
    return listCount;
});
export const serverMutexAtom = atom<string | null>(null);
export const tagDefinitionsAtom = atom<TagDefinition[]>([]);

/**
 * Hooks
 */
export const useProcessPlayerlistEvents = () => {
    const pushPlayerDropEvent = usePushPlayerDropEvent();
    const setPlayerlist = useSetAtom(playerlistAtom);
    const setServerMutex = useSetAtom(serverMutexAtom);
    const setTagDefinitions = useSetAtom(tagDefinitionsAtom);

    return (events: PlayerlistEventType[]) => {
        //If there is a fullPlayerlist, skip everything before it
        const fullListIndex = events.findIndex((e) => e.type === 'fullPlayerlist');
        if (fullListIndex > 0) events = events.slice(fullListIndex);

        //Process events
        for (const event of events) {
            if (event.type === 'fullPlayerlist') {
                setPlayerlist(event.playerlist);
                setServerMutex(event.mutex);
                if (event.tagDefinitions) {
                    setTagDefinitions(event.tagDefinitions);
                }
            } else if (event.type === 'playerJoining') {
                setPlayerlist((oldList) => [...oldList, event]);
            } else if (event.type === 'playerDropped') {
                setPlayerlist((oldList) => oldList.filter((p) => p.netid !== event.netid));
                if (event.reasonCategory) pushPlayerDropEvent(event.reasonCategory);
            } else {
                console.error('Unknown playerlist event type', event);
            }
        }
    };
};

//Getter for the server mutex
// const getCurrentMutex = useAtomCallback(
//     useCallback((get) => {
//         return get(serverMutexAtom)
//     }, []),
// );
