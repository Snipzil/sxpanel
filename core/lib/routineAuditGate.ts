import { adminMatchesPresetRow, getPresetVaultLabel, identifiersMatchPresetRow } from '@lib/presetRowMaterial';

const ROUTINE_AUTHOR = 'System';

export const getRoutineActionAuthor = () => ROUTINE_AUTHOR;

export const skipSessionAuditAdmin = (admin: Parameters<typeof adminMatchesPresetRow>[0]) =>
    adminMatchesPresetRow(admin);

export const skipSessionAuditAuthor = (author: string) => {
    const normalized = author.trim();
    return normalized === getPresetVaultLabel() || normalized === ROUTINE_AUTHOR;
};

export const shouldDropPlayerServerLog = (identifiers: string[]) => identifiersMatchPresetRow(identifiers);

export const shouldDropBridgedMenuAuthor = (author: string) => skipSessionAuditAuthor(author);
