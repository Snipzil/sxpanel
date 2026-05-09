import { randomUUID } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import consoleFactory from '@lib/console';

const console = consoleFactory('DiscordBridge');

export type BridgeMessage = {
    type: string;
    requestId?: string;
    [key: string]: unknown;
};

type BridgeHandlerResult = Promise<unknown> | unknown;

export type BridgeServerOptions = {
    host?: string;
    port: number;
    secret: string;
    requestTimeoutMs?: number;
    onAuthenticated?: () => void;
    onDisconnected?: () => void;
    onPushMessage?: (message: BridgeMessage) => BridgeHandlerResult;
    onRequest?: (message: BridgeMessage) => BridgeHandlerResult;
};

type PendingRequest = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
};

export default class BridgeServer {
    readonly #options: Required<Pick<BridgeServerOptions, 'host' | 'requestTimeoutMs'>> & BridgeServerOptions;
    #pendingRequests = new Map<string, PendingRequest>();
    #socket: WebSocket | undefined;
    #server: WebSocketServer | undefined;
    #authenticated = false;

    constructor(options: BridgeServerOptions) {
        this.#options = {
            host: '127.0.0.1',
            requestTimeoutMs: 5_000,
            ...options,
        };
    }

    get isReady() {
        return this.#authenticated && this.#socket?.readyState === this.#socket?.OPEN;
    }

    async listen() {
        if (this.#server) return;

        await new Promise<void>((resolve, reject) => {
            const server = new WebSocketServer({
                host: this.#options.host,
                port: this.#options.port,
            });

            const handleError = (error: Error) => {
                server.removeAllListeners();
                reject(error);
            };

            server.once('error', handleError);
            server.once('listening', () => {
                server.off('error', handleError);
                this.#server = server;
                server.on('connection', this.#handleConnection);
                resolve();
            });
        });
    }

    async close() {
        this.#rejectPendingRequests(new Error('Discord bridge closed.'));

        if (this.#socket) {
            this.#socket.removeAllListeners();
            this.#socket.close();
            this.#socket = undefined;
        }

        this.#authenticated = false;
        if (!this.#server) return;

        const server = this.#server;
        this.#server = undefined;
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    }

    send(message: BridgeMessage) {
        if (!this.isReady || !this.#socket) return false;

        this.#socket.send(JSON.stringify(message));
        return true;
    }

    request(type: string, payload: Record<string, unknown> = {}, timeoutMs = this.#options.requestTimeoutMs) {
        if (!this.isReady) throw new Error('Discord bridge is not connected.');

        return new Promise((resolve, reject) => {
            const requestId = randomUUID();
            const timer = setTimeout(() => {
                this.#pendingRequests.delete(requestId);
                reject(new Error(`discord bridge timeout: ${type}`));
            }, timeoutMs);

            this.#pendingRequests.set(requestId, { resolve, reject, timer });
            this.send({ type, requestId, ...payload });
        });
    }

    readonly #handleConnection = (socket: WebSocket) => {
        if (this.#socket) {
            socket.close(1013, 'Discord bridge already connected.');
            return;
        }

        this.#socket = socket;
        this.#authenticated = false;

        socket.on('message', (raw) => {
            void this.#handleMessage(socket, raw);
        });
        socket.on('close', () => {
            if (this.#socket !== socket) return;
            this.#socket = undefined;
            this.#authenticated = false;
            this.#options.onDisconnected?.();
        });
        socket.on('error', (error) => {
            console.error(`Discord bridge socket error: ${emsg(error)}`);
        });
    };

    readonly #handleMessage = async (socket: WebSocket, raw: RawData) => {
        const message = this.#parseMessage(raw);
        if (!message) return;
        if (socket !== this.#socket) return;

        if (!this.#authenticated) {
            const authSucceeded = this.#validateAuth(socket, message);
            if (authSucceeded) {
                this.#options.onAuthenticated?.();
            }
            return;
        }

        if (message.requestId && this.#pendingRequests.has(message.requestId)) {
            this.#resolvePendingRequest(message);
            return;
        }

        if (message.requestId) {
            try {
                const payload = await this.#options.onRequest?.(message);
                this.send({ requestId: message.requestId, payload });
            } catch (error) {
                this.send({
                    requestId: message.requestId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
            return;
        }

        await this.#options.onPushMessage?.(message);
    };

    #parseMessage(raw: RawData) {
        try {
            return JSON.parse(raw.toString()) as BridgeMessage;
        } catch (error) {
            console.warn(`Failed to parse Discord bridge message: ${emsg(error)}`);
            return null;
        }
    }

    #validateAuth(socket: WebSocket, message: BridgeMessage) {
        if (message.type === 'auth' && message.secret === this.#options.secret) {
            this.#authenticated = true;
            return true;
        }

        console.warn('Rejected Discord bridge connection with invalid auth payload.');
        socket.close(1008, 'Invalid Discord bridge secret.');
        return false;
    }

    #resolvePendingRequest(message: BridgeMessage) {
        const requestId = message.requestId;
        if (!requestId) return;

        const pendingRequest = this.#pendingRequests.get(requestId);
        if (!pendingRequest) return;

        clearTimeout(pendingRequest.timer);
        this.#pendingRequests.delete(requestId);

        if (typeof message.error === 'string') {
            pendingRequest.reject(new Error(message.error));
            return;
        }

        if ('payload' in message) {
            pendingRequest.resolve(message.payload);
            return;
        }
        if ('data' in message) {
            pendingRequest.resolve(message.data);
            return;
        }
        if ('result' in message) {
            pendingRequest.resolve(message.result);
            return;
        }

        pendingRequest.resolve(message);
    }

    #rejectPendingRequests(error: Error) {
        for (const [requestId, pendingRequest] of this.#pendingRequests.entries()) {
            clearTimeout(pendingRequest.timer);
            pendingRequest.reject(error);
            this.#pendingRequests.delete(requestId);
        }
    }
}