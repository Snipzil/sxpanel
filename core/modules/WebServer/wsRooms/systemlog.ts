import type { RoomType } from '@modules/WebServer/webSocket';
import type { AuthedAdminType } from '@modules/WebServer/authLogic';
import { redactSystemLogEntriesIp } from '@modules/Logger/SystemLogger';
import type { SystemLogEntry } from '@shared/systemLogTypes';

/**
 * The systemlog room is responsible for the action log page
 */
export default {
    permission: 'txadmin.log.view',
    eventName: 'systemLogData',
    cumulativeBuffer: true,
    outBuffer: [],
    initialData: () => txCore.logger.system.getRecentBuffer(500),
    //Strip login IP addresses from entries for admins without the view_ips permission
    redact: (entries: SystemLogEntry[], admin: AuthedAdminType) => {
        return admin.hasPermission('txadmin.log.view_ips') ? entries : redactSystemLogEntriesIp(entries);
    },
    commands: {},
} satisfies RoomType;
