import { anyUndefined, calcExpirationFromDuration } from '@lib/misc';
import { ServerPlayer } from '@lib/player/playerClasses';
import consoleFactory from '@lib/console';
const console = consoleFactory('FXProc:FD3');

//Types
type StructuredTraceType = {
    key: number;
    value: {
        channel: string;
        data: any;
        file: string;
        func: string;
        line: number;
    };
};

/**
 * Handles custom tag add/remove from resource exports.
 */
const handlePlayerTagChange = (payload: any) => {
    try {
        const { action, netId, tagId } = payload;
        if (typeof action !== 'string' || typeof netId !== 'number' || typeof tagId !== 'string') {
            throw new Error('invalid payload');
        }
        //Validate tagId exists in custom config
        const validIds = new Set((txConfig.gameFeatures.customTags ?? []).map((t: any) => t.id));
        if (!validIds.has(tagId)) {
            throw new Error(`unknown custom tag id: ${tagId}`);
        }
        //Find player
        const player = txCore.fxPlayerlist.getPlayerById(netId);
        if (!(player instanceof ServerPlayer) || !player.isRegistered) {
            throw new Error(`player netid ${netId} not found or not registered`);
        }
        const dbData = player.getDbData();
        if (!dbData) throw new Error(`player has no DB data`);
        const current = dbData.customTags ?? [];
        let updated: string[];
        if (action === 'add') {
            if (current.includes(tagId)) return;
            updated = [...current, tagId];
        } else if (action === 'remove') {
            if (!current.includes(tagId)) return;
            updated = current.filter((t) => t !== tagId);
        } else {
            throw new Error(`invalid action: ${action}`);
        }
        player.mutateDbData({ customTags: updated });
    } catch (error) {
        console.warn(`handlePlayerTagChange error: ${emsg(error)}`);
    }
};

/**
 * Handles bridged commands from txResource.
 * TODO: use zod for type safety
 */
const handleBridgedCommands = (payload: any) => {
    if (payload.command === 'announcement') {
        try {
            //Validate input
            if (typeof payload.author !== 'string') throw new Error(`invalid author`);
            if (typeof payload.message !== 'string') throw new Error(`invalid message`);
            const message = (payload.message ?? '').trim();
            if (!message.length) throw new Error(`empty message`);

            //Resolve admin
            const author = payload.author;
            txCore.logger.system.write(author, `Sending announcement: ${message}`, 'action', {
                actionId: 'announcement.send',
            });

            // Dispatch `txAdmin:events:announcement`
            txCore.fxRunner.sendEvent('announcement', { message, author });

            // Sending discord announcement
            const publicAuthor = txCore.adminStore.getAdminPublicName(payload.author, 'message');
            txCore.discordBot.sendAnnouncement({
                type: 'info',
                title: {
                    key: 'nui_menu.misc.announcement_title',
                    data: { author: publicAuthor },
                },
                description: message,
            });
        } catch (error) {
            console.verbose.warn(`handleBridgedCommands handler error:`);
            console.verbose.dir(error);
        }
    } else if (payload.command === 'kick') {
        try {
            if (typeof payload.author !== 'string') throw new Error(`invalid author`);
            if (typeof payload.targetNetId !== 'number') throw new Error(`invalid targetNetId`);
            const reason = (typeof payload.reason === 'string' ? payload.reason : '').trim() || 'no reason provided';

            const player = txCore.fxPlayerlist.getPlayerById(payload.targetNetId);
            if (!(player instanceof ServerPlayer) || !player.isConnected) {
                throw new Error(`player netid ${payload.targetNetId} not found or not connected`);
            }

            const allIds = player.getAllIdentifiers();
            if (!allIds.length) throw new Error(`no identifiers found for player netid ${payload.targetNetId}`);
            txCore.database.actions.registerKick(allIds, payload.author, reason, player.displayName);
            txCore.logger.system.write(payload.author, `Kicked "${player.displayName}": ${reason}`, 'action', {
                actionId: 'player.kick',
            });

            const dropMessage = txCore.translator.t('kick_messages.player', { reason });
            txCore.fxRunner.sendEvent('playerKicked', {
                target: player.netid,
                author: payload.author,
                reason,
                dropMessage,
            });
        } catch (error) {
            console.verbose.warn(`handleBridgedCommands kick error:`);
            console.verbose.dir(error);
        }
    } else if (payload.command === 'ban') {
        try {
            if (typeof payload.author !== 'string') throw new Error(`invalid author`);
            if (typeof payload.targetNetId !== 'number') throw new Error(`invalid targetNetId`);
            const reason = (typeof payload.reason === 'string' ? payload.reason : '').trim() || 'no reason provided';
            const durationInput = (typeof payload.duration === 'string' ? payload.duration : '').trim() || 'permanent';

            const player = txCore.fxPlayerlist.getPlayerById(payload.targetNetId);
            if (!(player instanceof ServerPlayer)) {
                throw new Error(`player netid ${payload.targetNetId} not found`);
            }

            const { expiration, duration } = calcExpirationFromDuration(durationInput);

            const allIds = player.getAllIdentifiers();
            const allHwids = player.getAllHardwareIdentifiers();
            if (!allIds.length) throw new Error(`player has no identifiers`);

            const actionId = txCore.database.actions.registerBan(
                allIds,
                payload.author,
                reason,
                expiration,
                player.displayName,
                allHwids,
            );
            txCore.logger.system.write(payload.author, `Banned "${player.displayName}": ${reason}`, 'action', {
                actionId: 'player.ban',
            });

            //Prepare kick message
            let kickMessage;
            let durationTranslated: string | null = null;
            const publicAuthor = txCore.adminStore.getAdminPublicName(payload.author, 'punishment');
            const tOptions: any = { author: publicAuthor, reason };
            if (expiration !== false && duration) {
                durationTranslated = txCore.translator.tDuration(duration * 1000, { units: ['d', 'h'] as any });
                tOptions.expiration = durationTranslated;
                kickMessage = txCore.translator.t('ban_messages.kick_temporary', tOptions);
            } else {
                kickMessage = txCore.translator.t('ban_messages.kick_permanent', tOptions);
            }

            txCore.fxRunner.sendEvent('playerBanned', {
                author: payload.author,
                reason,
                actionId,
                expiration,
                durationInput,
                durationTranslated,
                targetNetId: player.netid,
                targetIds: allIds,
                targetHwids: allHwids,
                targetName: player.displayName,
                kickMessage,
            });
        } catch (error) {
            console.verbose.warn(`handleBridgedCommands ban error:`);
            console.verbose.dir(error);
        }
    } else if (payload.command === 'warn') {
        try {
            if (typeof payload.author !== 'string') throw new Error(`invalid author`);
            if (typeof payload.targetNetId !== 'number') throw new Error(`invalid targetNetId`);
            const reason = (typeof payload.reason === 'string' ? payload.reason : '').trim() || 'no reason provided';

            const player = txCore.fxPlayerlist.getPlayerById(payload.targetNetId);
            if (!(player instanceof ServerPlayer)) {
                throw new Error(`player netid ${payload.targetNetId} not found`);
            }

            const allIds = player.getAllIdentifiers();
            if (!allIds.length) throw new Error(`player has no identifiers`);

            const actionId = txCore.database.actions.registerWarn(allIds, payload.author, reason, player.displayName);
            txCore.logger.system.write(payload.author, `Warned "${player.displayName}": ${reason}`, 'action', {
                actionId: 'player.warn',
            });

            txCore.fxRunner.sendEvent('playerWarned', {
                author: payload.author,
                reason,
                actionId,
                targetNetId: player.isConnected ? player.netid : null,
                targetIds: allIds,
                targetName: player.displayName,
            });
        } catch (error) {
            console.verbose.warn(`handleBridgedCommands warn error:`);
            console.verbose.dir(error);
        }
    } else {
        console.warn(`Command bridge received invalid command:`);
        console.dir(payload);
    }
};

/**
 * Processes FD3 Messages
 *
 * Mapped message types:
 * - nucleus_connected
 * - watchdog_bark
 * - bind_error
 * - script_log
 * - script_structured_trace (handled by server logger)
 */
const handleFd3Messages = (mutex: string, trace: StructuredTraceType) => {
    //Filter valid and fresh packages
    if (!mutex || mutex !== txCore.fxRunner.child?.mutex) return;
    if (anyUndefined(trace, trace.value, trace.value.data, trace.value.channel)) return;
    const { channel, data } = trace.value;

    //Handle bind errors
    if (channel === 'citizen-server-impl' && data?.type === 'bind_error') {
        try {
            const newDelayBackoffMs = txCore.fxRunner.signalSpawnBackoffRequired(true);
            const [_ip, port] = data.address.split(':');
            const secs = Math.floor(newDelayBackoffMs / 1000);
            console.defer().error(`Detected FXServer error: Port ${port} is busy! Setting backoff delay to ${secs}s.`);
        } catch (e) {
            /* best-effort backoff signal */
        }
        return;
    }

    //Handle nucleus auth
    if (channel === 'citizen-server-impl' && data.type === 'nucleus_connected') {
        if (typeof data.url !== 'string') {
            console.error(`FD3 nucleus_connected event without URL.`);
        } else {
            try {
                const matches = /^(https:\/\/)?.*-([0-9a-z]{6,})\.users\.cfx\.re\/?$/.exec(data.url);
                if (!matches || !matches[2]) throw new Error(`invalid cfxid`);
                txCore.cacheStore.set('fxsRuntime:cfxId', matches[2]);
            } catch (error) {
                console.error(`Error decoding server nucleus URL.`);
            }
        }
        return;
    }

    //Handle watchdog
    if (channel === 'citizen-server-impl' && data.type === 'watchdog_bark') {
        setTimeout(() => {
            const thread = data?.thread ?? 'UNKNOWN';
            if (!data?.stack || data.stack.trim() === 'root') {
                console.error(`Detected server thread ${thread} hung without a stack trace.`);
            } else {
                console.error(`Detected server thread ${thread} hung with stack:`);
                console.error(`- ${data.stack}`);
                console.error('Please check the resource above to prevent server restarts.');
            }
        }, 250);
        return;
    }

    // if (data.type == 'script_log') {
    //     return console.dir(data);
    // }

    //Handle script traces
    if (channel === 'citizen-server-impl' && data.type === 'script_structured_trace' && data.resource === 'monitor') {
        if (data.payload.type === 'txAdminHeartBeat') {
            txCore.fxMonitor.handleHeartBeat('fd3');
        } else if (data.payload.type === 'txAdminLogData') {
            txCore.logger.server.write(data.payload.logs, mutex);
        } else if (data.payload.type === 'txAdminLogNodeHeap') {
            txCore.metrics.svRuntime.logServerNodeMemory(data.payload);
        } else if (data.payload.type === 'txAdminResourceEvent') {
            txCore.fxResources.handleServerEvents(data.payload, mutex);
        } else if (data.payload.type === 'txAdminResourcePerf') {
            txCore.fxResources.handlePerfData(data.payload);
        } else if (data.payload.type === 'txAdminResourceRuntimes') {
            txManager.txRuntime.handleResourceRuntimes(data.payload);
        } else if (data.payload.type === 'txAdminPlayerlistEvent') {
            txCore.fxPlayerlist.handleServerEvents(data.payload, mutex);
        } else if (data.payload.type === 'txAdminCommandBridge') {
            handleBridgedCommands(data.payload);
        } else if (data.payload.type === 'txAdminAckWarning') {
            txCore.database.actions.ackWarn(data.payload.actionId);
        } else if (data.payload.type === 'txAdminPlayerTag') {
            handlePlayerTagChange(data.payload);
        }
    }
};

/**
 * Handles all the FD3 traces from the FXServer
 * NOTE: this doesn't need to be a class, but might need to hold state in the future
 */
export default (mutex: string, trace: StructuredTraceType) => {
    try {
        handleFd3Messages(mutex, trace);
    } catch (error) {
        console.verbose.error('Error processing FD3 stream output:');
        console.verbose.dir(error);
    }
};
