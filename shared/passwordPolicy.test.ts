import { describe, expect, it } from 'vitest';
import { validateAdminPassword } from './passwordPolicy';

describe('validateAdminPassword', () => {
    it('accepts a password that meets all rules', () => {
        expect(validateAdminPassword('SecurePass1!')).toEqual({ ok: true });
    });

    it('rejects short passwords', () => {
        const result = validateAdminPassword('Short1!');
        expect(result.ok).toBe(false);
    });

    it('rejects passwords missing a symbol', () => {
        const result = validateAdminPassword('SecurePass12');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain('symbol');
    });

    it('rejects leading or trailing spaces', () => {
        const result = validateAdminPassword(' SecurePass1!');
        expect(result.ok).toBe(false);
    });
});
