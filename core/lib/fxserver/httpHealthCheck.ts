import { FxMonitorHealth } from '@shared/enums';

/**
 * When true, sxPanel must not treat FXServer HTTP endpoints as a liveness signal;
 * health is derived purely from the FD3 heartbeat instead.
 */
export const isHttpHealthCheckDisabled = () => {
    const value = txConfig.restarter.disableHealthCheck;
    return value === true || value === 'true';
};

/**
 * Maps monitor-reported health to the value exposed to panel, Discord, scheduler context, etc.
 */
export const getEffectiveFxMonitorHealth = (
    reported: FxMonitorHealth,
    isHeartBeatHealthy: boolean,
    isChildAlive: boolean,
): FxMonitorHealth => {
    if (!isHttpHealthCheckDisabled()) return reported;
    if (!isChildAlive) return FxMonitorHealth.OFFLINE;
    if (isHeartBeatHealthy) return FxMonitorHealth.ONLINE;
    return reported;
};

/**
 * Connected player count for UI (panel header, Discord, host status), sourced solely
 * from the real FD3-backed playerlist.
 */
export const getDisplayPlayerCount = () => txCore.fxPlayerlist?.onlineCount ?? 0;
