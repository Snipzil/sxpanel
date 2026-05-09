const modulename = 'AdminStore:PermissionPresets';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { txHostConfig } from '@core/globalData';
import consoleFactory from '@lib/console';
import type { PermissionPreset } from '@shared/permissions';

const console = consoleFactory(modulename);

const PRESETS_FILE = txHostConfig.dataSubPath('permissionPresets.json');

const isPermissionPreset = (value: unknown): value is PermissionPreset => {
    if (!value || typeof value !== 'object') return false;

    const preset = value as Partial<PermissionPreset>;
    return (
        typeof preset.id === 'string' &&
        preset.id.length > 0 &&
        typeof preset.name === 'string' &&
        preset.name.trim().length > 0 &&
        Array.isArray(preset.permissions) &&
        preset.permissions.every((permission) => typeof permission === 'string')
    );
};

const normalizePermissionPresetIds = (presetIds: unknown) => {
    if (typeof presetIds === 'string' && presetIds.length) {
        return [presetIds];
    }

    if (!Array.isArray(presetIds)) {
        return [] as string[];
    }

    const normalized = [] as string[];
    for (const presetId of presetIds) {
        if (typeof presetId !== 'string' || !presetId.length || normalized.includes(presetId)) continue;
        normalized.push(presetId);
    }

    return normalized;
};

export const readCustomPermissionPresets = () => {
    try {
        if (!fs.existsSync(PRESETS_FILE)) return [] as PermissionPreset[];

        const raw = fs.readFileSync(PRESETS_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return [] as PermissionPreset[];

        return data.filter(isPermissionPreset).map((preset) => ({
            id: preset.id,
            name: preset.name.trim(),
            permissions: preset.permissions,
        }));
    } catch (error) {
        console.warn(`Failed to read permission presets: ${emsg(error)}`);
        return [] as PermissionPreset[];
    }
};

export const writeCustomPermissionPresets = async (presets: PermissionPreset[]) => {
    await fsp.writeFile(PRESETS_FILE, JSON.stringify(presets, null, 2));
};

export const getAllPermissionPresets = () => {
    return readCustomPermissionPresets();
};

export const resolvePermissionPresetIdsFromCatalog = (catalog: PermissionPreset[], presetIds: unknown) => {
    const presetMap = new Map(catalog.map((preset) => [preset.id, preset]));
    const matchedPresetIds = [] as string[];
    const matchedPresetNames = [] as string[];
    const grantedPermissions = new Set<string>();

    for (const presetId of normalizePermissionPresetIds(presetIds)) {
        const preset = presetMap.get(presetId);
        if (!preset) continue;

        matchedPresetIds.push(preset.id);
        matchedPresetNames.push(preset.name);
        for (const permission of preset.permissions) {
            grantedPermissions.add(permission);
        }
    }

    return {
        presetIds: matchedPresetIds,
        presetNames: matchedPresetNames,
        permissions: [...grantedPermissions],
    };
};

export const resolvePermissionPresetIds = (presetIds: unknown) => {
    return resolvePermissionPresetIdsFromCatalog(getAllPermissionPresets(), presetIds);
};