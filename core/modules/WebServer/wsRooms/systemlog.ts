import type { RoomType } from '@modules/WebServer/webSocket';

/**
 * The systemlog room is responsible for the action log page
 */
export default {
    permission: 'txadmin.log.view',
    eventName: 'systemLogData',
    cumulativeBuffer: true,
    outBuffer: [],
    initialData: () => txCore.logger.system.getRecentBuffer(500),
    commands: {},
} satisfies RoomType;
