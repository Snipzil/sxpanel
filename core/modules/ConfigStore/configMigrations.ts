const modulename = 'ConfigStore:Migration';
import fs from 'node:fs';
import { ConfigFileData, PartialTxConfigs } from './schema/index';
import { txEnv } from '@core/globalData';
import fatalError from '@lib/fatalError';
import { CONFIG_VERSION } from './consts';
import { migrateOldConfig } from './schema/oldConfig';
import { migrateLegacyWhitelistConfig } from './schema/whitelist';
import consoleFactory from '@lib/console';
import { chalkInversePad } from '@lib/misc';
import { DEFAULT_QUEUE_CONFIG, migrateQueueConfig, QueueRuleSchema } from '@shared/queueTypes';
const console = consoleFactory(modulename);

/**
 * Saves a backup of the current config file
 */
const saveBackupFile = (version: number) => {
    const bkpFileName = `config.backup.v${version}.json`;
    fs.copyFileSync(txEnv.profileSubPath('config.json'), txEnv.profileSubPath(bkpFileName));
    console.log(`A backup of your config file was saved as: ${chalkInversePad(bkpFileName)}`);
};

/**
 * Migrates the old config file to the new schema
 */
export const migrateConfigFile = (fileData: any): ConfigFileData => {
    const oldConfig = structuredClone(fileData);
    let oldVersion: number | undefined;
    let workingConfig: any = fileData;

    //Sanity check
    if ('version' in fileData && typeof fileData.version !== 'number') {
        fatalError.ConfigStore(20, 'Your txAdmin config.json version is not a number!');
    }
    if (typeof fileData.version === 'number' && fileData.version > CONFIG_VERSION) {
        fatalError.ConfigStore(21, [
            `Your config.json file is on v${fileData.version}, and this sxPanel supports up to v${CONFIG_VERSION}.`,
            'This means you likely downgraded your sxPanel or FXServer.',
            'Please make sure your sxPanel is updated!',
            '',
            'If you want to downgrade FXServer (the "artifact") but keep sxPanel updated,',
            'you can move the updated "citizen/system_resources/monitor" folder',
            'to older FXserver artifact, replacing the old files.',
            `Alternatively, you can restore the v${fileData.version} backup on the folder below.`,
            ['File Path', txEnv.profileSubPath('config.json')],
        ]);
    }
    if (fileData.version === 1) {
        throw new Error(`File with explicit version '1' should not exist.`);
    }

    if (!('version' in workingConfig) && 'global' in workingConfig && 'fxRunner' in workingConfig) {
        console.warn('Updating your sxPanel config.json from v1 to v2.');
        oldVersion ??= 1;
        const justNonDefaults = migrateOldConfig(oldConfig) as PartialTxConfigs;
        workingConfig = {
            version: 2,
            ...justNonDefaults,
        };
    }

    if (workingConfig.version === 2) {
        console.warn('Updating your sxPanel config.json from v2 to v3.');
        console.warn('This process will migrate whitelist mode to workflows/tiers.');
        oldVersion ??= 2;
        const { whitelist: legacyWhitelist, version: _legacyVersion, ...rest } = workingConfig;
        const migratedWhitelist = migrateLegacyWhitelistConfig(legacyWhitelist ?? {});
        workingConfig = {
            ...rest,
            version: 3,
            whitelist: migratedWhitelist,
        };
    }

    if (workingConfig.version === 3) {
        console.warn('Updating your sxPanel config.json from v3 to v4.');
        console.warn('This process will migrate whitelist tiers to the queue system.');
        oldVersion ??= 3;

        const {
            whitelist,
            queue: _legacyQueue,
            version: _legacyVersion,
            ...rest
        } = workingConfig as {
            whitelist?: any;
            queue?: any;
            version?: any;
            [key: string]: any;
        };

        const tierList = Array.isArray(whitelist?.tiers) ? whitelist.tiers : [];
        const rules = tierList
            .map((tier: any) => ({
                id: typeof tier?.id === 'string' && tier.id.length ? tier.id : 'default',
                label: typeof tier?.name === 'string' && tier.name.trim().length ? tier.name.trim() : 'Default',
                discordRoleIds: Array.isArray(tier?.discordRoleIds)
                    ? tier.discordRoleIds.filter((v: unknown): v is string => typeof v === 'string' && v.length > 0)
                    : [],
                priority: typeof tier?.priority === 'number' && Number.isInteger(tier.priority) ? tier.priority : 0,
            }))
            .filter((rule: unknown) => QueueRuleSchema.safeParse(rule).success);

        workingConfig = {
            ...rest,
            version: 4,
            whitelist: whitelist
                ? Object.fromEntries(Object.entries(whitelist).filter(([key]) => key !== 'tiers'))
                : whitelist,
            queue: {
                ...DEFAULT_QUEUE_CONFIG,
                rules,
            },
        };
    }

    if (workingConfig.version === 4) {
        console.warn('Updating your sxPanel config.json from v4 to v5.');
        console.warn('This process will migrate queue reserved access to per-rule settings.');
        oldVersion ??= 4;

        const {
            queue,
            version: _legacyVersion,
            ...rest
        } = workingConfig as {
            queue?: unknown;
            version?: unknown;
            [key: string]: unknown;
        };

        workingConfig = {
            ...rest,
            version: 5,
            queue: migrateQueueConfig(queue ?? {}),
        };
    }

    if (workingConfig.version === 5) {
        console.warn('Updating your sxPanel config.json from v5 to v6.');
        console.warn('This process will migrate queue reserved settings to slot pools.');
        oldVersion ??= 5;

        const {
            queue,
            version: _legacyVersion,
            ...rest
        } = workingConfig as {
            queue?: unknown;
            version?: unknown;
            [key: string]: unknown;
        };

        workingConfig = {
            ...rest,
            version: 6,
            queue: migrateQueueConfig(queue ?? {}),
        };
    }

    if (workingConfig.version === CONFIG_VERSION) {
        if (oldVersion) saveBackupFile(oldVersion);
        return workingConfig;
    }

    throw new Error(`Unknown file version: ${workingConfig.version}`);
};
