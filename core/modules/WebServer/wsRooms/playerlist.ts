import type { RoomType } from '@modules/WebServer/webSocket';
import { FullPlayerlistEventType } from '@shared/socketioTypes';
import { getTagDefinitions } from '@lib/player/playerTags';

/**
 * The the playerlist room is joined on all (except solo) pages when in web mode
 */
export default {
    permission: true, //everyone can see it
    eventName: 'playerlist',
    cumulativeBuffer: true,
    outBuffer: [],
    initialData: () => {
        return [
            {
                mutex: txCore.fxRunner.child?.mutex ?? null,
                type: 'fullPlayerlist',
                playerlist: txCore.fxPlayerlist.getPlayerList(),
                tagDefinitions: getTagDefinitions(),
            } satisfies FullPlayerlistEventType,
        ];
    },
} satisfies RoomType;
