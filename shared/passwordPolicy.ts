import consts from './consts';

const SYMBOL_CHARS = '!@#$%^&*()_+-=[]{}|;:.,<>?';

export const PASSWORD_POLICY_DESCRIPTION = `At least ${consts.adminPasswordMinLength} characters, including uppercase, lowercase, a number, and a symbol (${SYMBOL_CHARS}).`;

export type PasswordValidationResult = { ok: true } | { ok: false; error: string };

const hasUppercase = (value: string) => /[A-Z]/.test(value);
const hasLowercase = (value: string) => /[a-z]/.test(value);
const hasDigit = (value: string) => /\d/.test(value);
const hasSymbol = (value: string) => /[!@#$%^&*()_+\-=[\]{}|;:.,<>?]/.test(value);

/**
 * Validates an admin-chosen password against the panel policy.
 */
export function validateAdminPassword(password: string): PasswordValidationResult {
    if (typeof password !== 'string') {
        return { ok: false, error: 'Password is required.' };
    }

    if (password.trim() !== password) {
        return {
            ok: false,
            error: 'Your password cannot start or end with a space.',
        };
    }

    if (password.length < consts.adminPasswordMinLength || password.length > consts.adminPasswordMaxLength) {
        return {
            ok: false,
            error: `Password must be between ${consts.adminPasswordMinLength} and ${consts.adminPasswordMaxLength} characters.`,
        };
    }

    if (!hasUppercase(password)) {
        return { ok: false, error: 'Password must include at least one uppercase letter.' };
    }
    if (!hasLowercase(password)) {
        return { ok: false, error: 'Password must include at least one lowercase letter.' };
    }
    if (!hasDigit(password)) {
        return { ok: false, error: 'Password must include at least one number.' };
    }
    if (!hasSymbol(password)) {
        return { ok: false, error: `Password must include at least one symbol (${SYMBOL_CHARS}).` };
    }

    return { ok: true };
}
