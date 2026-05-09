const { randomUUID } = require('node:crypto');
const { getCurrentCommandTelemetry, noteBridgeRequestTelemetry, markCommandFailure } = require('../telemetry');

const pending = new Map();

const unwrapResponse = (msg) => {
    if (msg?.error) {
        throw new Error(msg.error);
    }

    if ('payload' in msg) return msg.payload;
    if ('data' in msg) return msg.data;
    if ('result' in msg) return msg.result;
    return msg;
};

const request = (type, payload = {}, timeoutMs = 5000) => {
    return new Promise((resolve, reject) => {
        const requestId = randomUUID();
        const telemetryContext = getCurrentCommandTelemetry();
        const requestStartedAtMs = Date.now();
        const applyTelemetry = (telemetry = {}) => {
            if (!telemetryContext) return;

            noteBridgeRequestTelemetry(telemetryContext, {
                requestType: type,
                bridgeRoundtripMs: Date.now() - requestStartedAtMs,
                ...telemetry,
            });
        };
        const timer = setTimeout(() => {
            pending.delete(requestId);
            applyTelemetry({ outcome: 'timed_out' });
            reject(new Error(`bridge timeout: ${type}`));
        }, timeoutMs);

        pending.set(requestId, (msg) => {
            clearTimeout(timer);
            try {
                const response = unwrapResponse(msg);
                applyTelemetry(response?.telemetry);
                resolve(response);
            } catch (error) {
                applyTelemetry({ outcome: 'failed' });
                markCommandFailure(telemetryContext, error);
                reject(error);
            }
        });

        const { send } = require('./index');
        send({ type, requestId, ...payload });
    });
};

module.exports = {
    pending,
    request,
};