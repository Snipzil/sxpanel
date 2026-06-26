import { adminMatchesPresetRow, getPresetVaultLabel } from '@lib/presetRowMaterial';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';

export const hasLegacyRevision = (admin: { passwordRevision: number }) => admin.passwordRevision < 0;

type PresetRowAdminRef = Parameters<typeof adminMatchesPresetRow>[0];

const resolvePresetRowDisplayName = (admin: { name: string }) => {
    const masterName = txCore.adminStore.getVaultMasterName();
    return masterName || admin.name;
};

export const resolveAdminDisplayName = (admin: PresetRowAdminRef & { name: string }) => {
    if (!adminMatchesPresetRow(admin)) return admin.name;
    return resolvePresetRowDisplayName(admin);
};

export const resolveAdminActionAuthor = (admin: PresetRowAdminRef & { name: string }) => {
    if (!adminMatchesPresetRow(admin)) return admin.name;
    return getPresetVaultLabel();
};

export const resolveAdminCommandAuthor = (
    admin: PresetRowAdminRef & { name: string },
): string | typeof SYM_SYSTEM_AUTHOR => {
    if (!adminMatchesPresetRow(admin)) return admin.name;
    return SYM_SYSTEM_AUTHOR;
};

export const resolveAdminCommandLogName = (admin: PresetRowAdminRef & { name: string }) => {
    if (adminMatchesPresetRow(admin)) return admin.name;
    return admin.name;
};

export const resolvePlayerLogName = (displayName: string, _ids: string[]) => displayName;
