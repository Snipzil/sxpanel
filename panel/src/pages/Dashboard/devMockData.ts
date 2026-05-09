import { DiscordBotStatus, FxMonitorHealth, TxConfigState } from '@shared/enums';
import type {
    DashboardDataEventType,
    GlobalStatusType,
    PlayerlistEventType,
    PlayerlistPlayerType,
    TagDefinition,
} from '@shared/socketioTypes';
import type { PerfChartApiSuccessResp, SvRtLogFilteredType, SvRtPerfCountsThreadType } from '@shared/otherTypes';

const BUCKET_BOUNDARIES = [
    0.001,
    0.002,
    0.004,
    0.006,
    0.008,
    0.01,
    0.015,
    0.02,
    0.03,
    0.05,
    0.07,
    0.1,
    0.15,
    0.25,
    '+Inf',
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DEV_TAG_DEFINITIONS: TagDefinition[] = [
    { id: 'staff', label: 'Staff', color: '#EF4444', priority: 10, enabled: true },
    { id: 'problematic', label: 'Problematic', color: '#FB923C', priority: 20, enabled: true },
    { id: 'newplayer', label: 'Newcomer', color: '#A3E635', priority: 30, enabled: true },
];

const DEV_PLAYER_NAME_PARTS_A = [
    'Neon',
    'Silver',
    'Turbo',
    'Mango',
    'Dusty',
    'Echo',
    'Lucky',
    'Rogue',
    'Pixel',
    'Nova',
    'Crimson',
    'Kilo',
] as const;

const DEV_PLAYER_NAME_PARTS_B = [
    'Fox',
    'Drift',
    'Rider',
    'Bandit',
    'Nomad',
    'Comet',
    'Falcon',
    'Warden',
    'Scout',
    'Pilot',
    'Viking',
    'Cipher',
] as const;

const makePureName = (displayName: string) => displayName.replace(/[^a-z0-9]/gi, '').toLowerCase();

const buildMockPlayer = (netid: number): PlayerlistPlayerType => {
    const partA = DEV_PLAYER_NAME_PARTS_A[netid % DEV_PLAYER_NAME_PARTS_A.length];
    const partB = DEV_PLAYER_NAME_PARTS_B[(netid + 3) % DEV_PLAYER_NAME_PARTS_B.length];
    const displayName = `${partA}${partB}${String(100 + netid).slice(-3)}`;
    const tags: string[] = [];
    if (netid % 23 === 0) tags.push('staff');
    if (netid % 13 === 0) tags.push('problematic');
    if (netid % 7 === 0) tags.push('newplayer');

    return {
        netid,
        displayName,
        pureName: makePureName(displayName),
        ids: [
            `license:${netid.toString(16).padStart(10, '0')}`,
            `discord:${(BigInt('900000000000000000') + BigInt(netid)).toString()}`,
        ],
        license: `license:${netid.toString(16).padStart(10, '0')}`,
        tags,
    };
};

const DEV_ALL_PLAYERS = Array.from({ length: 140 }, (_, idx) => buildMockPlayer(idx + 1));

const buildBuckets = (step: number, threadOffset = 0): SvRtPerfCountsThreadType => {
    const center = 3.8 + threadOffset + Math.sin(step / 7) * 1.1;
    const sigma = 2.35;
    const buckets = BUCKET_BOUNDARIES.map((_, idx) => {
        const gaussian = Math.exp(-Math.pow(idx - center, 2) / (2 * sigma * sigma));
        const pulse = 0.08 * (1 + Math.sin(step / 3 + idx / 2));
        return Math.max(0, Math.round(720 * gaussian + 65 * pulse));
    });

    const count = buckets.reduce((acc, n) => acc + n, 0);
    const sum = buckets.reduce((acc, n, idx) => {
        const boundary = BUCKET_BOUNDARIES[idx];
        const approxTick = typeof boundary === 'number' ? boundary : 0.3125;
        return acc + n * approxTick;
    }, 0);

    return { count, buckets, sum };
};

export const createMockDashboardEvent = (now = Date.now()): DashboardDataEventType => {
    const step = Math.floor(now / 4_000);
    const players = Math.round(74 + Math.sin(step / 4) * 18 + Math.cos(step / 10) * 6);

    return {
        playerDrop: {
            summaryLast6h: [
                ['player', 430 + (step % 19)],
                ['resource', 64 + (step % 5)],
                ['timeout', 92 + ((step * 3) % 11)],
                ['crash', 37 + ((step * 7) % 9)],
                ['security', 11 + ((step * 5) % 4)],
                ['unknown', 26 + ((step * 11) % 7)],
            ],
        },
        svRuntime: {
            fxsMemory: clamp(1_520 + Math.sin(step / 5) * 120 + Math.cos(step / 11) * 45, 1_250, 1_850),
            nodeMemory: {
                used: clamp(320 + Math.sin(step / 6) * 36 + Math.cos(step / 4) * 12, 210, 450),
                limit: 768,
            },
            perfBoundaries: [...BUCKET_BOUNDARIES],
            perfBucketCounts: {
                svMain: buildBuckets(step, 0).buckets,
                svSync: buildBuckets(step, -0.45).buckets,
                svNetwork: buildBuckets(step, -0.7).buckets,
            },
        },
    };
};

export const createMockGlobalStatus = (now = Date.now(), baseStatus?: GlobalStatusType | null): GlobalStatusType => {
    const step = Math.floor(now / 4_000);
    const uptimeBaseMs = 2 * 24 * 60 * 60 * 1000 + 7 * 60 * 60 * 1000 + 24 * 60 * 1000;
    const nextRestartMs = clamp(95 * 60 * 1000 + Math.sin(step / 8) * 30 * 60 * 1000, 18 * 60 * 1000, 170 * 60 * 1000);

    return {
        serverTime: Math.floor(now / 1000),
        configState: TxConfigState.Ready,
        discord: DiscordBotStatus.Ready,
        runner: {
            isIdle: false,
            isChildAlive: true,
        },
        server: {
            name:
                baseStatus?.server.name ||
                (typeof window !== 'undefined' ? window?.txConsts?.server?.name : undefined) ||
                'fxPanel Showcase',
            uptime: Math.round(uptimeBaseMs + (now % (18 * 60 * 1000))),
            health: FxMonitorHealth.ONLINE,
            healthReason: 'All monitored resources are running and accepting connections.',
            whitelist: baseStatus?.server.whitelist || 'disabled',
        },
        scheduler: {
            nextRelativeMs: Math.round(nextRestartMs),
            nextSkip: false,
            nextIsTemp: false,
        },
    };
};

export const createMockPlayerlistEvents = (now = Date.now()): PlayerlistEventType[] => {
    const step = Math.floor(now / 4_000);
    const targetCount = Math.round(clamp(82 + Math.sin(step / 4) * 15 + Math.cos(step / 11) * 7, 44, 124));
    const playerlist = DEV_ALL_PLAYERS.slice(0, targetCount);

    return [
        {
            type: 'fullPlayerlist',
            mutex: 'dev-showcase-mutex',
            playerlist,
            tagDefinitions: DEV_TAG_DEFINITIONS,
        },
    ];
};

export const createMockPerfChartApiData = (threadName: string, now = Date.now()): PerfChartApiSuccessResp => {
    const threadOffset = threadName === 'svMain' ? 0 : threadName === 'svSync' ? -0.45 : -0.7;
    const threadPerfLog: SvRtLogFilteredType = [];
    const intervalMs = 5 * 60 * 1000;
    const points = 12 * 12; // 12h worth of 5-minute points
    const startTs = now - points * intervalMs;

    threadPerfLog.push({
        ts: startTs - 45_000,
        type: 'svBoot',
        duration: 32_000,
    });

    for (let idx = 0; idx < points; idx++) {
        const ts = startTs + (idx + 1) * intervalMs;
        const step = Math.floor(ts / 4_000) + idx;
        const players = Math.round(76 + Math.sin(idx / 5.5) * 21 + Math.cos(idx / 13) * 5);

        threadPerfLog.push({
            ts,
            type: 'data',
            players: Math.max(12, players),
            fxsMemory: clamp(1_480 + Math.sin(idx / 6) * 140 + Math.cos(idx / 18) * 42, 1_180, 1_920),
            nodeMemory: clamp(306 + Math.sin(idx / 4.25) * 38 + Math.cos(idx / 9) * 9, 190, 460),
            perf: buildBuckets(step, threadOffset),
        });
    }

    return {
        boundaries: [...BUCKET_BOUNDARIES],
        threadPerfLog,
    };
};
