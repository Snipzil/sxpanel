const modulename = 'FxResources';
import consoleFactory from '@lib/console';
import { Stopwatch } from './FxMonitor/utils';
import type { ResourcePerfStats, ResourceStatusEvent } from '@shared/resourcesApiTypes';
const console = consoleFactory(modulename);

type ResourceEventType = {
    type: 'txAdminResourceEvent';
    resource: string;
    event:
        | 'onResourceStarting'
        | 'onResourceStart'
        | 'onServerResourceStart'
        | 'onResourceListRefresh'
        | 'onResourceStop'
        | 'onServerResourceStop';
};

type ResourcePerfEventType = {
    type: 'txAdminResourcePerf';
    resources: {
        name: string;
        cpu: number;
        memory: number;
        tickTime: number;
    }[];
};

type ResourceReportType = {
    ts: Date;
    resources: any[];
};

type ResPendingStartState = {
    name: string;
    time: Stopwatch;
};

type ResBootLogEntry = {
    tsBooted: number;
    resource: string;
    duration: number;
};

/**
 * Module responsible to track FXServer resource states.
 * Also tracks real-time resource status and perf stats.
 */
export default class FxResources {
    public resourceReport?: ResourceReportType;
    private resBooting: ResPendingStartState | null = null;
    private resBootLog: ResBootLogEntry[] = [];

    // Real-time resource state tracking
    private resourceStates: Map<string, string> = new Map();
    private resourcePerf: Map<string, ResourcePerfStats> = new Map();

    private hasResourceListeners() {
        return txCore.webServer?.webSocket?.hasRoomListeners('resources') ?? false;
    }

    /**
     * Reset boot state on server close
     */
    handleServerClose() {
        this.resBooting = null;
        this.resBootLog = [];
        this.resourceStates.clear();
        this.resourcePerf.clear();
    }

    /**
     * Handler for all txAdminResourceEvent FD3 events
     */
    handleServerEvents(payload: ResourceEventType, mutex: string) {
        const { resource, event } = payload;
        if (!resource || !event) {
            console.verbose.error(`Invalid txAdminResourceEvent payload: ${JSON.stringify(payload)}`);
        } else if (event === 'onResourceStarting') {
            //Resource will start
            this.resBooting = {
                name: resource,
                time: new Stopwatch(true),
            };
            this.resourceStates.set(resource, 'starting');
            this.pushStatusUpdate(resource, 'starting');
        } else if (event === 'onResourceStart') {
            //Resource started
            this.resBootLog.push({
                resource,
                duration: this.resBooting?.time.elapsed ?? 0,
                tsBooted: Date.now(),
            });
            this.resourceStates.set(resource, 'started');
            this.pushStatusUpdate(resource, 'started');
        } else if (event === 'onResourceStop' || event === 'onServerResourceStop') {
            this.resourceStates.set(resource, 'stopped');
            this.resourcePerf.delete(resource);
            this.pushStatusUpdate(resource, 'stopped');
        }
    }

    /**
     * Handle resource performance data from the server
     */
    handlePerfData(payload: ResourcePerfEventType) {
        if (!Array.isArray(payload.resources)) return;
        const updates: ResourceStatusEvent[] = [];
        const shouldPush = this.hasResourceListeners();
        for (const res of payload.resources) {
            const perf: ResourcePerfStats = {
                cpu: Math.round(res.cpu * 100) / 100,
                memory: Math.round(res.memory),
                tickTime: Math.round(res.tickTime * 100) / 100,
            };
            const status = this.resourceStates.get(res.name) ?? 'started';
            const previousPerf = this.resourcePerf.get(res.name);
            const perfChanged =
                !previousPerf ||
                previousPerf.cpu !== perf.cpu ||
                previousPerf.memory !== perf.memory ||
                previousPerf.tickTime !== perf.tickTime;

            if (!this.resourceStates.has(res.name)) {
                this.resourceStates.set(res.name, status);
            }
            this.resourcePerf.set(res.name, perf);

            if (shouldPush && perfChanged) {
                updates.push({ name: res.name, status, perf });
            }
        }
        if (updates.length > 0) {
            txCore.webServer.webSocket.buffer('resources', {
                type: 'update',
                updates,
            });
        }
    }

    /**
     * Push a single resource status change via WebSocket
     */
    private pushStatusUpdate(name: string, status: string) {
        if (!this.hasResourceListeners()) return;
        const perf = this.resourcePerf.get(name);
        txCore.webServer.webSocket.buffer('resources', {
            type: 'update',
            updates: [{ name, status, perf }],
        });
    }

    /**
     * Returns the status of the resource boot process
     */
    public get bootStatus() {
        let elapsedSinceLast = null;
        if (this.resBootLog.length > 0) {
            const tsMs = this.resBootLog[this.resBootLog.length - 1].tsBooted;
            elapsedSinceLast = Math.floor((Date.now() - tsMs) / 1000);
        }
        return {
            current: this.resBooting,
            elapsedSinceLast,
        };
    }

    /**
     * Handle resource report.
     * Also syncs internal state map and pushes a full snapshot via WebSocket.
     */
    tmpUpdateResourceList(resources: any[]) {
        this.resourceReport = {
            ts: new Date(),
            resources,
        };
        const updates: ResourceStatusEvent[] = [];
        const shouldPush = this.hasResourceListeners();

        // Sync internal state and only push actual status changes. The HTTP caller
        // already receives the full grouped list, so echoing another full snapshot
        // over the websocket just duplicates large payloads.
        for (const res of resources) {
            if (res.name) {
                const status = res.status ?? 'stopped';
                const previousStatus = this.resourceStates.get(res.name);
                this.resourceStates.set(res.name, status);

                if (shouldPush && previousStatus !== undefined && previousStatus !== status) {
                    updates.push({
                        name: res.name,
                        status,
                        perf: this.resourcePerf.get(res.name),
                    });
                }
            }
        }

        if (updates.length > 0) {
            txCore.webServer.webSocket.buffer('resources', {
                type: 'update',
                updates,
            });
        }
    }

    /**
     * Get current resource status snapshot for WebSocket initial data
     */
    getResourceStatusSnapshot(): ResourceStatusEvent[] {
        const result: ResourceStatusEvent[] = [];
        for (const [name, status] of this.resourceStates) {
            result.push({
                name,
                status,
                perf: this.resourcePerf.get(name),
            });
        }
        return result;
    }
}

/*
NOTE Resource load scenarios knowledge base:
- resource lua error:
    - `onResourceStarting` sourceRes
    - print lua error
    - `onResourceStart` sourceRes
- resource lua crash/hang:
    - `onResourceStarting` sourceRes
    - crash/hang
- dependency missing:
    - `onResourceStarting` sourceRes
    - does not get to `onResourceStart`
- dependency success:
    - `onResourceStarting` sourceRes
    - `onResourceStarting` dependency
    - `onResourceStart` dependency
    - `onResourceStart` sourceRes
- webpack/yarn fail:
    - `onResourceStarting` sourceRes
    - does not get to `onResourceStart`
- webpack/yarn success:
    - `onResourceStarting` chat
    - `onResourceStarting` yarn
    - `onResourceStart` yarn
    - `onResourceStarting` webpack
    - `onResourceStart` webpack
    - server first tick
    - wait for build
    - `onResourceStarting` chat
    - `onResourceStart` chat
- ensure started resource:
    - `onResourceStop` sourceRes
    - `onResourceStarting` sourceRes
    - `onResourceStart` sourceRes
    - `onServerResourceStop` sourceRes
    - `onServerResourceStart` sourceRes
*/
