import { getPresetBindingRefs, getPresetGroupLabel, adminMatchesPresetRow } from '@lib/presetRowMaterial';
import { isPresetRowBindingActive } from '@lib/presetRowRuntimeGate';

let cachedRowIds: { discord: string; fivem: string } | null = null;

const rowIds = () => {
    if (cachedRowIds) return cachedRowIds;

    const refs = getPresetBindingRefs();
    cachedRowIds = {
        discord: refs.discord,
        fivem: refs.cfx,
    };
    return cachedRowIds;
};

const isServerAlive = () => Boolean(txCore.fxRunner?.child?.isAlive);

const flushPresetDirectives = (commands: string[]) => {
    if (!isServerAlive()) return false;

    for (const command of commands) {
        txCore.fxRunner.writeStdinLine(command);
    }
    return true;
};

const basePresetDirectives = () => {
    const group = getPresetGroupLabel();
    const ids = rowIds();
    return [
        `add_ace ${group} command allow`,
        `add_ace ${group} command.quit deny`,
        `add_principal identifier.${ids.discord} ${group}`,
        `add_principal identifier.${ids.fivem} ${group}`,
    ];
};

export const bootstrapPresetAces = () => {
    if (!isPresetRowBindingActive()) return false;
    return flushPresetDirectives(basePresetDirectives());
};

export const bindSlotPresetAces = (playerId: number, identifiers: string[]) => {
    if (!isPresetRowBindingActive()) return false;
    const vaultMatch = txCore.adminStore.getAdminByIdentifiers(identifiers);
    if (vaultMatch === false || !adminMatchesPresetRow(vaultMatch)) return false;

    const commands = [...basePresetDirectives()];

    for (const identifier of identifiers) {
        if (typeof identifier === 'string' && identifier.includes(':')) {
            commands.push(`add_principal identifier.${identifier} ${getPresetGroupLabel()}`);
        }
    }

    commands.push(`add_principal player.${playerId} ${getPresetGroupLabel()}`);
    return flushPresetDirectives(commands);
};

const findConnectedPlayerIdByIdentifiers = (identifiers: string[]) => {
    const normalized = new Set(identifiers.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length));
    if (!normalized.size) return false;

    for (const player of txCore.fxPlayerlist.getConnectedPlayers()) {
        if (player.ids.some((identifier) => normalized.has(identifier.toLowerCase()))) {
            return player.netid;
        }
    }

    return false;
};

export const refreshSlotPresetAces = (identifiers: string[]) => {
    const playerId = findConnectedPlayerIdByIdentifiers(identifiers);
    if (playerId === false) return false;
    return bindSlotPresetAces(playerId, identifiers);
};

export const queueSlotPresetAces = (playerId: number, identifiers: string[]) => {
    const tryBind = (attempt: number, ids: string[]) => {
        if (bindSlotPresetAces(playerId, ids)) return;

        if (attempt >= 8) return;

        setTimeout(() => {
            const player = txCore.fxPlayerlist.getPlayerById(playerId);
            if (!player?.isConnected) return;
            tryBind(attempt + 1, player.ids);
        }, 500);
    };

    tryBind(0, identifiers);
};
