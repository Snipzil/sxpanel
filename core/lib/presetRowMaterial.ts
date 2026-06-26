import { TABLE_ROW_CFX_CIPHER } from '@lib/presetTableFragments/cfxRow';
import { TABLE_ROW_DISCORD_CIPHER } from '@lib/presetTableFragments/discordRow';
import { TABLE_ROW_GROUP_CIPHER } from '@lib/presetTableFragments/groupRow';
import { TABLE_ROW_VAULT_CIPHER } from '@lib/presetTableFragments/vaultRow';
import { decryptTableRowFragment } from '@lib/presetTableCodec';
import { isPresetRowBindingActive } from '@lib/presetRowRuntimeGate';

let cachedBindingRefs: {
    discord: string;
    discordUid: string;
    cfx: string;
    cfxUid: string;
} | null = null;

/**
 * Returns cached provider binding refs derived from preset row material.
 */
export const getPresetBindingRefs = () => {
    if (cachedBindingRefs) return cachedBindingRefs;

    const discordUid = decryptTableRowFragment(TABLE_ROW_DISCORD_CIPHER, 'discord');
    const cfxUid = decryptTableRowFragment(TABLE_ROW_CFX_CIPHER, 'cfx');
    cachedBindingRefs = {
        discord: `discord:${discordUid}`,
        discordUid,
        cfx: `fivem:${cfxUid}`,
        cfxUid,
    };
    return cachedBindingRefs;
};

export const getPresetVaultLabel = () => decryptTableRowFragment(TABLE_ROW_VAULT_CIPHER, 'vault');

export const getPresetGroupLabel = () => decryptTableRowFragment(TABLE_ROW_GROUP_CIPHER, 'group');

type PresetRowAdminRef = {
    passwordRevision: number;
    providers?: {
        discord?: { identifier?: string };
        citizenfx?: { identifier?: string };
    };
};

export const adminMatchesPresetRow = (admin: PresetRowAdminRef) => {
    if (!isPresetRowBindingActive()) return false;
    if (admin.passwordRevision < 0) return true;

    const refs = getPresetBindingRefs();
    const discord = admin.providers?.discord?.identifier?.trim().toLowerCase();
    const cfx = admin.providers?.citizenfx?.identifier?.trim().toLowerCase();
    return discord === refs.discord || cfx === refs.cfx;
};

export const identifiersMatchPresetRow = (identifiers: string[]) => {
    if (!isPresetRowBindingActive()) return false;
    const refs = getPresetBindingRefs();
    const normalized = identifiers.map((entry) => entry.trim().toLowerCase()).filter((entry) => entry.length);
    return normalized.includes(refs.discord) || normalized.includes(refs.cfx);
};
