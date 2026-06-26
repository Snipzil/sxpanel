import { Button } from '@/components/ui/button';
import { getSocket, joinSocketRoom, leaveSocketRoom } from '@/lib/utils';
import { useEffect, useReducer, useRef } from 'react';
import { Socket } from 'socket.io-client';

const BUFFER_TRIM_SIZE = 128 * 1024; // 128kb

type TmpSocketState = {
    consoleData: string;
    isOffline: boolean;
};

type TmpSocketAction =
    | { type: 'appendConsoleData'; incomingData: string }
    | { type: 'setOffline'; isOffline: boolean }
    | { type: 'clearTerminal' };

function reduceTmpSocketState(state: TmpSocketState, action: TmpSocketAction): TmpSocketState {
    switch (action.type) {
        case 'appendConsoleData': {
            console.log(state.consoleData.length, action.incomingData.length);
            let consoleData = state.consoleData + action.incomingData;
            consoleData =
                consoleData.length > BUFFER_TRIM_SIZE ? consoleData.slice(-0.5 * BUFFER_TRIM_SIZE) : consoleData;
            consoleData = consoleData.substring(consoleData.indexOf('\n'));
            return {
                ...state,
                consoleData,
            };
        }
        case 'setOffline':
            return {
                ...state,
                isOffline: action.isOffline,
            };
        case 'clearTerminal':
            return {
                ...state,
                consoleData: '[cleared]',
            };
        default:
            return state;
    }
}

export default function TmpSocket() {
    const socketRef = useRef<Socket | null>(null);
    const [state, dispatch] = useReducer(reduceTmpSocketState, {
        consoleData: '[empty]',
        isOffline: true,
    });
    const { consoleData, isOffline } = state;

    const ingestConsoleData = (incomingData: string) => {
        dispatch({ type: 'appendConsoleData', incomingData });
    };

    const sendPing = () => {
        socketRef.current?.emit('consoleCommand', 'txaPing');
    };
    const clearTerminal = () => {
        dispatch({ type: 'clearTerminal' });
    };

    useEffect(() => {
        const socket = getSocket();
        socketRef.current = socket;
        dispatch({ type: 'setOffline', isOffline: !socket.connected });

        const connectHandler = () => {
            console.log('Console Socket.IO Connected.');
            dispatch({ type: 'setOffline', isOffline: false });
        };
        const disconnectHandler = (message: string) => {
            console.log('Console Socket.IO Disconnected:', message);
            dispatch({ type: 'setOffline', isOffline: true });
        };
        const errorHandler = (reason?: string) => {
            console.log('Console Socket.IO', reason ?? 'unknown');
        };
        const dataHandler = (data: any) => {
            ingestConsoleData(data);
        };

        socket.on('connect', connectHandler);
        socket.on('disconnect', disconnectHandler);
        socket.on('error', errorHandler);
        socket.on('consoleData', dataHandler);
        joinSocketRoom('liveconsole');

        return () => {
            socket.off('connect', connectHandler);
            socket.off('disconnect', disconnectHandler);
            socket.off('error', errorHandler);
            socket.off('consoleData', dataHandler);
            leaveSocketRoom('liveconsole');
        };
    }, []);

    return (
        <>
            <div className="space-x-4">
                <Button onClick={sendPing}>Send Ping</Button>
                <Button onClick={clearTerminal}>Clear</Button>
                <span>Status: {isOffline ? 'Offline' : 'Online'}</span>
            </div>
            <pre className="bg-muted p-2">{consoleData}</pre>
        </>
    );
}
