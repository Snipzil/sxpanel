import type { PermissionDefinition, PermCategory } from '@shared/permissions';

type TranslateFn = (key: string, tOptions?: Record<string, string | number>, defaultValue?: string) => string;

export const translatePermissionLabel = (t: TranslateFn, perm: PermissionDefinition): string => {
    const key = `panel.permissions.${perm.id.replace(/\./g, '_')}.label`;
    return t(key, undefined, perm.label);
};

export const translatePermissionDescription = (t: TranslateFn, perm: PermissionDefinition): string => {
    const key = `panel.permissions.${perm.id.replace(/\./g, '_')}.description`;
    return t(key, undefined, perm.description);
};

export const translatePermCategoryLabel = (t: TranslateFn, category: PermCategory): string => {
    const key = `panel.permissions.categories.${category.id}`;
    return t(key, undefined, category.label);
};
