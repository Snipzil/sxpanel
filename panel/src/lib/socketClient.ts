import { io, type Socket } from 'socket.io-client';
import type { ListenEventsMap } from '@shared/socketioTypes';

/**
 * Returns a singleton socket.io client instance.
 * The socket connects with status (and playerlist for web) rooms.
 * Use joinSocketRoom/leaveSocketRoom to dynamically join/leave additional rooms.
 */
let mainSocket: Socket<ListenEventsMap, any> | null = null;
const subscribedRooms = new Set<string>();

export const destroySocket = () => {
    if (mainSocket) {
        mainSocket.disconnect();
        mainSocket = null;
    }
    subscribedRooms.clear();
};

export const getSocket = () => {
    if (mainSocket) return mainSocket;

    const rooms = window.txConsts.isWebInterface ? 'status,playerlist' : 'status';
    const socketOpts = {
        transports: ['polling'] as ('polling' | 'websocket')[],
        upgrade: false,
        withCredentials: true,
        query: {
            rooms,
            uiVersion: window.txConsts.txaVersion,
        },
    };

    const socket = window.txConsts.isWebInterface
        ? io({ ...socketOpts, path: '/socket.io' })
        : io('monitor', { ...socketOpts, path: '/WebPipe/socket.io' });

    mainSocket = socket as Socket<ListenEventsMap, any>;

    //Re-join dynamic rooms on reconnect
    mainSocket.on('connect', () => {
        for (const room of subscribedRooms) {
            mainSocket!.emit('joinRoom', room);
        }
    });

    return mainSocket;
};

export const joinSocketRoom = (roomName: string) => {
    subscribedRooms.add(roomName);
    const socket = getSocket();
    if (socket.connected) {
        socket.emit('joinRoom', roomName);
    }
};

export const leaveSocketRoom = (roomName: string) => {
    subscribedRooms.delete(roomName);
    const socket = getSocket();
    if (socket.connected) {
        socket.emit('leaveRoom', roomName);
    }
};
