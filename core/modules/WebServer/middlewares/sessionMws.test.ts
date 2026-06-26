import { suite, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionMemoryStorage } from './sessionMws';

suite('SessionMemoryStorage', () => {
    let store: SessionMemoryStorage;

    beforeEach(() => {
        vi.useFakeTimers();
        store = new SessionMemoryStorage(60_000);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should store and retrieve a session', () => {
        store.set('sess-1', { auth: undefined });
        const sess = store.get('sess-1');
        expect(sess).toBeDefined();
    });

    it('should return undefined for unknown key', () => {
        expect(store.get('nonexistent')).toBeUndefined();
    });

    it('should destroy a session', () => {
        store.set('sess-1', { auth: undefined });
        store.destroy('sess-1');
        expect(store.get('sess-1')).toBeUndefined();
    });

    it('should expire sessions after maxAgeMs', () => {
        store.set('sess-1', { auth: undefined });
        expect(store.get('sess-1')).toBeDefined();

        vi.advanceTimersByTime(61_000);
        expect(store.get('sess-1')).toBeUndefined();
    });

    it('should refresh session expiry', () => {
        store.set('sess-1', { auth: undefined });

        vi.advanceTimersByTime(50_000);
        store.refresh('sess-1');

        vi.advanceTimersByTime(50_000);
        expect(store.get('sess-1')).toBeDefined();

        vi.advanceTimersByTime(15_000);
        expect(store.get('sess-1')).toBeUndefined();
    });

    it('should track size correctly', () => {
        expect(store.size).toBe(0);
        store.set('a', { auth: undefined });
        store.set('b', { auth: undefined });
        expect(store.size).toBe(2);
        store.destroy('a');
        expect(store.size).toBe(1);
    });

    it('should overwrite sessions with same key', () => {
        const passAuth = {
            type: 'password' as const,
            username: 'admin1',
            csrfToken: 'csrf1',
            expiresAt: false as const,
            password_revision: 0,
        };
        const passAuth2 = {
            type: 'password' as const,
            username: 'admin2',
            csrfToken: 'csrf2',
            expiresAt: false as const,
            password_revision: 1,
        };
        store.set('sess-1', { auth: passAuth });
        store.set('sess-1', { auth: passAuth2 });
        expect(store.size).toBe(1);
        const sess = store.get('sess-1');
        expect(sess?.auth?.username).toBe('admin2');
    });

    it('should not refresh nonexistent session', () => {
        store.refresh('nonexistent');
        expect(store.size).toBe(0);
    });

    it('should handle default maxAgeMs', () => {
        const defaultStore = new SessionMemoryStorage();
        expect(defaultStore.maxAgeMs).toBe(24 * 60 * 60 * 1000);
    });
});
