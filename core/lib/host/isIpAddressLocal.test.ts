import { suite, it, expect } from 'vitest';
import { isIpAddressLocal, isIpAddressLoopback, addLocalIpAddress } from './isIpAddressLocal';

suite('isIpAddressLocal', () => {
    suite('loopback addresses', () => {
        it('should accept IPv4 loopback', () => {
            expect(isIpAddressLocal('127.0.0.1')).toBe(true);
            expect(isIpAddressLocal('127.0.0.2')).toBe(true);
            expect(isIpAddressLocal('127.255.255.255')).toBe(true);
            expect(isIpAddressLocal('::ffff:127.0.0.1')).toBe(true);
        });

        it('should accept IPv6 loopback', () => {
            expect(isIpAddressLocal('::1')).toBe(true);
        });

        it('should identify only loopback addresses as loopback', () => {
            expect(isIpAddressLoopback('127.0.0.1')).toBe(true);
            expect(isIpAddressLoopback('::ffff:127.0.0.1')).toBe(true);
            expect(isIpAddressLoopback('::1')).toBe(true);
            expect(isIpAddressLoopback('10.0.0.1')).toBe(false);
            expect(isIpAddressLoopback('192.168.0.1')).toBe(false);
            expect(isIpAddressLoopback('fd00::1')).toBe(false);
        });
    });

    suite('private/LAN addresses', () => {
        it('should accept 192.168.x.x', () => {
            expect(isIpAddressLocal('192.168.0.1')).toBe(true);
            expect(isIpAddressLocal('192.168.1.100')).toBe(true);
            expect(isIpAddressLocal('192.168.255.255')).toBe(true);
        });

        it('should accept 10.x.x.x', () => {
            expect(isIpAddressLocal('10.0.0.1')).toBe(true);
            expect(isIpAddressLocal('10.255.255.255')).toBe(true);
        });

        it('should accept 172.16.0.0/12', () => {
            expect(isIpAddressLocal('172.16.0.1')).toBe(true);
            expect(isIpAddressLocal('172.31.255.255')).toBe(true);
        });

        it('should accept fd00:: (IPv6 ULA)', () => {
            expect(isIpAddressLocal('fd00::1')).toBe(true);
            expect(isIpAddressLocal('fd00::abcd')).toBe(true);
        });
    });

    suite('public/external addresses', () => {
        it('should reject public IPv4 addresses', () => {
            expect(isIpAddressLocal('8.8.8.8')).toBe(false);
            expect(isIpAddressLocal('1.1.1.1')).toBe(false);
            expect(isIpAddressLocal('203.0.113.1')).toBe(false);
            expect(isIpAddressLocal('172.217.0.0')).toBe(false);
        });

        it('should reject public IPv6 addresses', () => {
            expect(isIpAddressLocal('2001:db8::1')).toBe(false);
            expect(isIpAddressLocal('2607:f8b0:4004:800::200e')).toBe(false);
        });

        it('should reject empty string', () => {
            expect(isIpAddressLocal('')).toBe(false);
        });
    });

    suite('addLocalIpAddress', () => {
        it('should allow a registered custom IP', () => {
            const customIp = '203.0.113.99';
            expect(isIpAddressLocal(customIp)).toBe(false);
            addLocalIpAddress(customIp);
            expect(isIpAddressLocal(customIp)).toBe(true);
        });
    });
});
