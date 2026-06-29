import { beforeEach, describe, expect, it, vi } from 'vitest';
import FxResources from './FxResources';

describe('FxResources websocket updates', () => {
    let buffer: ReturnType<typeof vi.fn>;
    let hasRoomListeners: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        buffer = vi.fn();
        hasRoomListeners = vi.fn(() => false);
        vi.stubGlobal('txCore', {
            webServer: {
                webSocket: {
                    buffer,
                    hasRoomListeners,
                },
            },
        });
    });

    it('stores full resource reports without echoing a full websocket snapshot', () => {
        const fxResources = new FxResources();

        fxResources.tmpUpdateResourceList([{ name: 'es_extended', status: 'started' }]);

        expect(buffer).not.toHaveBeenCalled();
        expect(fxResources.getResourceStatusSnapshot()).toEqual([{ name: 'es_extended', status: 'started' }]);
    });

    it('pushes report-derived status deltas only when the resources room has listeners', () => {
        const fxResources = new FxResources();

        hasRoomListeners.mockReturnValue(true);
        fxResources.tmpUpdateResourceList([{ name: 'es_extended', status: 'started' }]);
        expect(buffer).not.toHaveBeenCalled();

        fxResources.tmpUpdateResourceList([{ name: 'es_extended', status: 'stopped' }]);
        expect(buffer).toHaveBeenCalledWith('resources', {
            type: 'update',
            updates: [{ name: 'es_extended', status: 'stopped', perf: undefined }],
        });
    });

    it('skips repeated perf websocket updates when nobody is subscribed or values did not change', () => {
        const fxResources = new FxResources();
        const perfPayload = {
            type: 'txAdminResourcePerf',
            resources: [{ name: 'es_extended', cpu: 0, memory: 0, tickTime: 0 }],
        } as const;

        fxResources.handlePerfData(perfPayload);
        expect(buffer).not.toHaveBeenCalled();

        hasRoomListeners.mockReturnValue(true);
        fxResources.handlePerfData(perfPayload);
        expect(buffer).not.toHaveBeenCalled();

        fxResources.handlePerfData({
            type: 'txAdminResourcePerf',
            resources: [{ name: 'es_extended', cpu: 1.234, memory: 128.4, tickTime: 2.345 }],
        });

        expect(buffer).toHaveBeenCalledWith('resources', {
            type: 'update',
            updates: [
                {
                    name: 'es_extended',
                    status: 'started',
                    perf: { cpu: 1.23, memory: 128, tickTime: 2.35 },
                },
            ],
        });
    });
});
