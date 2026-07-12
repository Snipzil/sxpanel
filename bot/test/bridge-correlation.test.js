const bridge = require('../bridge');
const handlers = require('../bridge/handlers');
const { pending, request } = require('../bridge/requests');

const flushTimeouts = () => new Promise((resolve) => setTimeout(resolve, 0));

const resetPending = () => {
    for (const key of [...pending.keys()]) {
        pending.delete(key);
    }
};

describe('bridge correlation', () => {
    beforeEach(() => {
        resetPending();
    });

    afterEach(() => {
        resetPending();
    });

    test('resolves a pending request when a correlated response arrives', async () => {
        const sent = [];
        const originalSend = bridge.send;
        bridge.send = (msg) => sent.push(msg);

        try {
            const promise = request('configSnapshot', { foo: 'bar' }, 2000);
            expect(pending.size).toBe(1);

            const { requestId } = sent[0];
            await bridge.handleIncomingMessage(
                JSON.stringify({ type: 'configSnapshot', requestId, payload: { ok: true } }),
            );

            const result = await promise;
            expect(result).toEqual({ ok: true });
            expect(pending.has(requestId)).toBe(false);
        } finally {
            bridge.send = originalSend;
        }
    });

    test('routes unmatched messages to the handler layer', async () => {
        const handleSpy = vi.fn();
        const originalHandle = handlers.handle;
        handlers.handle = handleSpy;

        try {
            const outcome = await bridge.handleIncomingMessage(
                JSON.stringify({ type: 'sendAnnouncement', payload: { description: 'hi' } }),
            );

            expect(outcome.routed).toBe('event');
            expect(outcome.type).toBe('sendAnnouncement');
            expect(handleSpy).toHaveBeenCalledTimes(1);
            expect(pending.size).toBe(0);
        } finally {
            handlers.handle = originalHandle;
        }
    });

    test('does not consume a pending entry for an event without a matching requestId', async () => {
        const handleSpy = vi.fn();
        const originalHandle = handlers.handle;
        handlers.handle = handleSpy;

        const resolver = vi.fn();
        pending.set('known-id', resolver);

        try {
            const outcome = await bridge.handleIncomingMessage(
                JSON.stringify({ type: 'postLogMessage', requestId: 'unknown-id' }),
            );

            expect(outcome.routed).toBe('event');
            expect(resolver).not.toHaveBeenCalled();
            expect(pending.has('known-id')).toBe(true);
        } finally {
            handlers.handle = originalHandle;
        }
    });

    test('ignores unparseable messages without throwing and without routing', async () => {
        const handleSpy = vi.fn();
        const originalHandle = handlers.handle;
        handlers.handle = handleSpy;

        try {
            const outcome = await bridge.handleIncomingMessage('not-json{');
            expect(outcome.parsed).toBe(false);
            expect(handleSpy).not.toHaveBeenCalled();
        } finally {
            handlers.handle = originalHandle;
        }
    });

    test('rejects the request promise when the server returns an error field', async () => {
        const sent = [];
        const originalSend = bridge.send;
        bridge.send = (msg) => sent.push(msg);

        try {
            const promise = request('resolveMemberRoles', { uid: '123' }, 2000);
            const { requestId } = sent[0];

            await bridge.handleIncomingMessage(
                JSON.stringify({ type: 'resolveMemberRoles', requestId, error: 'boom' }),
            );

            await expect(promise).rejects.toThrow(/boom/);
            expect(pending.has(requestId)).toBe(false);
        } finally {
            bridge.send = originalSend;
        }
    });

    test('rejects the request promise on timeout', async () => {
        const originalSend = bridge.send;
        bridge.send = () => {};

        try {
            await expect(request('configSnapshot', {}, 50)).rejects.toThrow(/timeout/);
            await flushTimeouts();
        } finally {
            bridge.send = originalSend;
        }
    });
});
