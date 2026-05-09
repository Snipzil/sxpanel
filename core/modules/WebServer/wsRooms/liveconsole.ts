import type { RoomType } from '@modules/WebServer/webSocket';
import { AuthedAdminType } from '@modules/WebServer/authLogic';
import type { LiveConsoleInitialData } from '@shared/consoleBlock';

//Tracks the clear sequence per admin session (by admin name)
const adminClearSeqs = new Map<string, number>();

/**
 * The console room is responsible for the server live console page
 */
export default {
    permission: 'console.view',
    eventName: 'consoleData',
    cumulativeBuffer: true,
    outBuffer: '',
    initialData: (adminName?: string): LiveConsoleInitialData => {
        const allBlocks = txCore.logger.fxserver.getRecentBlocks();
        const clearSeq = (adminName ? adminClearSeqs.get(adminName) : undefined) ?? 0;
        const blocks = clearSeq > 0 ? allBlocks.filter((b) => b.seq > clearSeq) : allBlocks;
        return {
            blocks,
            oldestSeq: allBlocks.length ? allBlocks[0].seq : 0,
            clearSeq,
        };
    },
    commands: {
        consoleCommand: {
            permission: 'console.write',
            handler: (admin: AuthedAdminType, command: string) => {
                if (typeof command !== 'string' || !command) return;
                const sanitized = command.replaceAll(/\n/g, ' ');
                admin.logCommand(sanitized, 'console.command');
                txCore.fxRunner.sendRawCommand(sanitized, admin.name);
                txCore.fxRunner.sendEvent('consoleCommand', {
                    channel: 'fxPanel',
                    command: sanitized,
                    author: admin.name,
                });
            },
        },
        consoleClear: {
            permission: 'console.view',
            handler: (admin: AuthedAdminType) => {
                const currentSeq = txCore.logger.fxserver.getCurrentSeq();
                adminClearSeqs.set(admin.name, currentSeq);
            },
        },
        consoleLoadOlder: {
            permission: 'console.view',
            handler: (admin: AuthedAdminType, beforeSeq: number, callback: (data: any) => void) => {
                if (typeof beforeSeq !== 'number' || typeof callback !== 'function') return;
                const allBlocks = txCore.logger.fxserver.getRecentBlocks();
                const olderBlocks = allBlocks.filter((b) => b.seq < beforeSeq);
                callback({
                    blocks: olderBlocks,
                    oldestSeq: allBlocks.length ? allBlocks[0].seq : 0,
                });
            },
        },
    },
} satisfies RoomType;
