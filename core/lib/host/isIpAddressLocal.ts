const modulename = 'IpChecker';
import consoleFactory from '@lib/console';
const console = consoleFactory(modulename);

const extendedAllowedLanIps: string[] = [];

const isPrivateIPv4 = (ipAddress: string): boolean => {
    const parts = ipAddress.split('.').map((octet) => Number(octet));
    if (parts.length !== 4 || parts.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return false;
    }
    const [first, second] = parts;
    if (first === 127) return true;
    if (first === 10) return true;
    if (first === 192 && second === 168) return true;
    if (first === 172 && second >= 16 && second <= 31) return true;
    return false;
};

const getIPv4MappedAddress = (ipAddress: string): string => {
    const match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ipAddress);
    return match?.[1] ?? ipAddress;
};

export const isIpAddressLoopback = (ipAddress: string): boolean => {
    const normalizedIp = getIPv4MappedAddress(ipAddress);
    const parts = normalizedIp.split('.').map((octet) => Number(octet));
    if (parts.length === 4 && parts.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
        return parts[0] === 127;
    }
    return normalizedIp === '::1';
};

/**
 * Return if the IP Address is a loopback interface, LAN, detected WAN or any other
 * IP that is registered by the user via the forceInterface convar or config file.
 *
 * This is used to secure the webpipe auth and the rate limiter.
 */
export const isIpAddressLocal = (ipAddress: string): boolean => {
    const normalizedIp = getIPv4MappedAddress(ipAddress);
    if (isPrivateIPv4(normalizedIp)) return true;
    if (/^(::1|fd00::)/.test(ipAddress)) return true;
    return extendedAllowedLanIps.includes(ipAddress);
};

/**
 * Used to register a new LAN interface.
 * Added automatically from TXHOST_INTERFACE and banner.js after detecting the WAN address.
 */
export const addLocalIpAddress = (ipAddress: string): void => {
    // console.verbose.debug(`Adding local IP address: ${ipAddress}`);
    extendedAllowedLanIps.push(ipAddress);
};
