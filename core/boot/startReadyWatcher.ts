import boxen, { type Options as BoxenOptions } from 'boxen';
import chalk from 'chalk';
import open from 'open';
import { isIP } from 'node:net';
import os from 'node:os';
import { shuffle } from 'd3-array';
import { z } from 'zod';

import got from '@lib/got';
import si from 'systeminformation';
import { txDevEnv, txEnv, txHostConfig } from '@core/globalData';
import consoleFactory from '@lib/console';
import { addLocalIpAddress } from '@lib/host/isIpAddressLocal';
import { chalkInversePad } from '@lib/misc';
const console = consoleFactory();

const ipv4StringSchema = z.string().refine((value) => isIP(value) === 4, 'Invalid IPv4 address');
const ipv6StringSchema = z.string().refine((value) => isIP(value) === 6, 'Invalid IPv6 address');

/**
 * Registers all non-internal network interface IPs as local addresses
 */
const registerInterfaceIps = () => {
    const interfaces = os.networkInterfaces();
    for (const ifaceAddrs of Object.values(interfaces)) {
        if (!ifaceAddrs) continue;
        for (const addr of ifaceAddrs) {
            if (addr.internal) continue;
            addLocalIpAddress(addr.address);
        }
    }
};

const fetchPublicIp = async (apis: string[][], validator: z.ZodType<string>) => {
    const reqOptions = {
        timeout: { request: 2000 },
    };
    const httpGetter = async (url: string, jsonPath: string) => {
        const res = await got(url, reqOptions).json();
        return validator.parse((res as any)[jsonPath]);
    };

    for await (const [url, jsonPath] of shuffle(apis)) {
        try {
            return await httpGetter(url, jsonPath);
        } catch (error) {
            /* try next IP provider */
        }
    }
    return false;
};

const getPublicIpv4 = () =>
    fetchPublicIp(
        [
            ['https://api.ipify.org?format=json', 'ip'],
            ['https://api.myip.com', 'ip'],
            ['https://ipv4.jsonip.com/', 'ip'],
            ['https://api.my-ip.io/v2/ip.json', 'ip'],
            ['https://www.l2.io/ip.json', 'ip'],
        ],
        ipv4StringSchema,
    );

const getPublicIpv6 = () =>
    fetchPublicIp(
        [
            ['https://api6.ipify.org?format=json', 'ip'],
            ['https://api6.my-ip.io/v2/ip.json', 'ip'],
        ],
        ipv6StringSchema,
    );

const getOSMessage = async () => {
    const serverMessage = [
        `To be able to access fxPanel from the internet open port ${txHostConfig.txaPort}`,
        'on your OS Firewall as well as in the hosting company.',
    ];
    const winWorkstationMessage = [
        '[!] Home-hosting fxserver is not recommended [!]',
        'You need to open the fxserver port (usually 30120) on Windows Firewall',
        'and set up port forwarding on your router so other players can access it.',
    ];
    const osInfo = await si.osInfo();
    const distro = osInfo.distro || `${osInfo.platform} ${osInfo.release}`;
    return distro.includes('Linux') || distro.includes('Server') ? serverMessage : winWorkstationMessage;
};

const awaitHttp = new Promise((resolve, reject) => {
    const tickLimit = 100; //if over 15 seconds
    let counter = 0;
    let interval: NodeJS.Timeout;
    const check = () => {
        counter++;
        if (txCore.webServer && txCore.webServer.isListening && txCore.webServer.isServing) {
            clearInterval(interval);
            resolve(true);
        } else if (counter == tickLimit) {
            clearInterval(interval);
            interval = setInterval(check, 2500);
        } else if (counter > tickLimit) {
            console.warn('The WebServer is taking too long to start:', {
                module: !!txCore.webServer,
                listening: txCore?.webServer?.isListening,
                serving: txCore?.webServer?.isServing,
            });
        }
    };
    interval = setInterval(check, 150);
});

const awaitMasterPin = new Promise((resolve, reject) => {
    const tickLimit = 100; //if over 15 seconds
    let counter = 0;
    let interval: NodeJS.Timeout;
    const check = () => {
        counter++;
        if (txCore.adminStore && txCore.adminStore.admins !== null) {
            clearInterval(interval);
            const pin = txCore.adminStore.admins === false ? txCore.adminStore.addMasterPin : false;
            resolve(pin);
        } else if (counter == tickLimit) {
            clearInterval(interval);
            interval = setInterval(check, 2500);
        } else if (counter > tickLimit) {
            console.warn('The AdminStore is taking too long to start:', {
                module: !!txCore.adminStore,
                admins: txCore?.adminStore?.admins === null ? 'null' : 'not null',
            });
        }
    };
    interval = setInterval(check, 150);
});

const awaitDatabase = new Promise((resolve, reject) => {
    const tickLimit = 100; //if over 15 seconds
    let counter = 0;
    let interval: NodeJS.Timeout;
    const check = () => {
        counter++;
        if (txCore.database && txCore.database.isReady) {
            clearInterval(interval);
            resolve(true);
        } else if (counter == tickLimit) {
            clearInterval(interval);
            interval = setInterval(check, 2500);
        } else if (counter > tickLimit) {
            console.warn('The Database is taking too long to start:', {
                module: !!txCore.database,
                ready: !!txCore?.database?.isReady,
            });
        }
    };
    interval = setInterval(check, 150);
});

export const startReadyWatcher = async (cb: () => void) => {
    //Register all local interface IPs
    registerInterfaceIps();

    const [publicIpv4Resp, publicIpv6Resp, msgRes, adminPinRes] = await Promise.allSettled([
        getPublicIpv4(),
        getPublicIpv6(),
        getOSMessage(),
        awaitMasterPin as Promise<undefined | string | false>,
        awaitHttp,
        awaitDatabase,
    ]);

    //Addresses
    let detectedUrls;
    if (txHostConfig.netInterface && txHostConfig.netInterface !== '0.0.0.0') {
        detectedUrls = [txHostConfig.netInterface];
    } else {
        detectedUrls = [txEnv.isWindows ? 'localhost' : 'your-public-ip'];
        if ('value' in publicIpv4Resp && publicIpv4Resp.value) {
            detectedUrls.push(publicIpv4Resp.value);
            addLocalIpAddress(publicIpv4Resp.value);
        }
        if ('value' in publicIpv6Resp && publicIpv6Resp.value) {
            detectedUrls.push(publicIpv6Resp.value);
            addLocalIpAddress(publicIpv6Resp.value);
        }
    }
    const bannerUrls = txHostConfig.txaUrl
        ? [txHostConfig.txaUrl]
        : detectedUrls.map((addr) => {
              const host = addr.includes(':') ? `[${addr}]` : addr;
              return `http://${host}:${txHostConfig.txaPort}/`;
          });

    //Admin PIN
    const adminMasterPin = 'value' in adminPinRes && adminPinRes.value ? adminPinRes.value : false;
    const adminPinLines = !adminMasterPin
        ? []
        : ['', 'Use the PIN below to register:', chalk.inverse(` ${adminMasterPin} `)];

    //Printing stuff
    const boxOptions = {
        padding: 1,
        margin: 1,
        align: 'center',
        borderStyle: 'bold',
        borderColor: 'cyan',
    } satisfies BoxenOptions;
    const boxLines = ['All ready! Please access:', ...bannerUrls.map(chalkInversePad), ...adminPinLines];
    console.multiline(boxen(boxLines.join('\n'), boxOptions), chalk.bgGreen);
    if (!txDevEnv.ENABLED && !txHostConfig.netInterface && 'value' in msgRes && msgRes.value) {
        console.multiline(msgRes.value, chalk.bgBlue);
    }

    //Opening page
    if (txEnv.isWindows && adminMasterPin && bannerUrls[0]) {
        const linkUrl = new URL(bannerUrls[0]);
        linkUrl.pathname = '/addMaster/pin';
        linkUrl.hash = adminMasterPin;
        open(linkUrl.href);
    }

    //Callback
    cb();
};
