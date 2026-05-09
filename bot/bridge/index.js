const WebSocket = require('ws');
const handlers = require('./handlers');
const { pending } = require('./requests');

let ws;
let client;
let reconnectTimer;
const queuedMessages = [];

const parseMessage = (raw) => {
    try {
        return JSON.parse(raw.toString());
    } catch (error) {
        console.error('[BotBridge] Failed to parse message:', error);
        return null;
    }
};

const scheduleReconnect = () => {
    if (!client || reconnectTimer) return;

    reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect(client);
    }, 5000);
};

const flushQueuedMessages = () => {
    if (ws?.readyState !== WebSocket.OPEN) return;

    while (queuedMessages.length > 0) {
        ws.send(JSON.stringify(queuedMessages.shift()));
    }
};

const connect = (discordClient) => {
    client = discordClient;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    ws = new WebSocket(`ws://127.0.0.1:${process.env.BOT_BRIDGE_PORT}`);
    ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'auth', secret: process.env.BOT_SECRET }));
        flushQueuedMessages();
    });
    ws.on('message', async (raw) => {
        const msg = parseMessage(raw);
        if (!msg) return;

        if (msg.requestId && pending.has(msg.requestId)) {
            const resolve = pending.get(msg.requestId);
            pending.delete(msg.requestId);
            resolve(msg);
            return;
        }

        try {
            await handlers.handle(msg, client);
        } catch (error) {
            console.error('[BotBridge] Failed to handle message:', error);
        }
    });
    ws.on('close', () => {
        ws = undefined;
        scheduleReconnect();
    });
    ws.on('error', (error) => {
        console.error('[BotBridge] WebSocket error:', error);
    });
};

const send = (msg) => {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return;
    }

    queuedMessages.push(msg);
};

const request = (...args) => {
    return require('./requests').request(...args);
};

module.exports = {
    connect,
    send,
    request,
};