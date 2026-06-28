import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';

type AdminRef = { name: string };

export const resolveAdminDisplayName = (admin: AdminRef) => admin.name;

export const resolveAdminActionAuthor = (admin: AdminRef) => admin.name;

export const resolveAdminCommandAuthor = (admin: AdminRef): string | typeof SYM_SYSTEM_AUTHOR => admin.name;

export const resolveAdminCommandLogName = (admin: AdminRef) => admin.name;

export const resolvePlayerLogName = (displayName: string, _ids: string[]) => displayName;
