import type { AuthedAdmin } from '@modules/AdminStore/adminClasses';

export type AdminAccessDeniedReason = 'temp_password_change_required' | 'two_factor_required';

export type AdminAccessDenied = {
    reason: AdminAccessDeniedReason;
    message: string;
};

const AUTH_UTILITY_PATHS = ['/auth/self', '/auth/logout'];

const TEMP_PASSWORD_ALLOWED_PATHS = new Set(['/auth/changePassword', ...AUTH_UTILITY_PATHS]);

const TWO_FACTOR_SETUP_ALLOWED_PATHS = new Set([
    '/auth/totp/setup',
    '/auth/totp/confirm',
    '/auth/changePassword',
    ...AUTH_UTILITY_PATHS,
]);

/** Master-only escape so a misconfigured server can turn the requirement off without 2FA. */
const MASTER_DISABLE_TWO_FACTOR_REQUIREMENT_PATHS = new Set(['/settings/configs/general']);

const isAllowedPath = (path: string, allowed: Set<string>) => allowed.has(path);

/**
 * Whether the admin is blocked from normal panel/NUI usage (temp password or missing required 2FA).
 */
export const getAdminAccessBlockReason = (admin: AuthedAdmin): AdminAccessDeniedReason | null => {
    if (admin.isTempPassword) return 'temp_password_change_required';
    if (txConfig.general.requireAdminTwoFactor && !admin.totpEnabled) {
        return 'two_factor_required';
    }
    return null;
};

/**
 * Returns an access denial when the admin must change a temp password or enable 2FA before using the panel/NUI.
 */
export const getAdminAccessDenial = (admin: AuthedAdmin, path: string): AdminAccessDenied | null => {
    const blockReason = getAdminAccessBlockReason(admin);
    if (!blockReason) return null;

    const allowed =
        blockReason === 'temp_password_change_required' ? TEMP_PASSWORD_ALLOWED_PATHS : TWO_FACTOR_SETUP_ALLOWED_PATHS;

    if (isAllowedPath(path, allowed)) return null;

    if (
        blockReason === 'two_factor_required' &&
        admin.isMaster &&
        isAllowedPath(path, MASTER_DISABLE_TWO_FACTOR_REQUIREMENT_PATHS)
    ) {
        return null;
    }

    if (blockReason === 'temp_password_change_required') {
        return {
            reason: blockReason,
            message: 'You must change your temporary password before using sxPanel.',
        };
    }

    return {
        reason: blockReason,
        message: 'Two-factor authentication is required. Enable 2FA in your account settings.',
    };
};
