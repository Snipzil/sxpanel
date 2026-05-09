const modulename = 'ConfigStore';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import consoleFactory from '@lib/console';
import fatalError from '@lib/fatalError';
import { txEnv } from '@core/globalData';
import { ConfigFileData, ConfigSchemas_v2, PartialTxConfigs, PartialTxConfigsToSave, TxConfigs } from './schema';
import { migrateConfigFile } from './configMigrations';
import { deepFreeze } from '@lib/misc';
import {
    parseConfigFileData,
    bootstrapConfigProcessor,
    runtimeConfigProcessor,
    getConfigDefaults,
} from './configParser';
import { ListOf } from './schema/utils';
import { CCLOG_VERSION, ConfigChangelogEntry, ConfigChangelogFileSchema, truncateConfigChangelog } from './changelog';
import { UpdateConfigKeySet } from './utils';
import { CONFIG_VERSION } from './consts';
import { getConfigChangeLogActionDefinition } from '@shared/systemLogTypes';
const console = consoleFactory(modulename);

//Types
export type RefreshConfigKey = { full: string; scope: string; key: string };
export type RefreshConfigFunc = (updatedConfigs: UpdateConfigKeySet) => void;
type RefreshConfigRegistry = {
    moduleName: string;
    callback: RefreshConfigFunc;
    rules: string[];
}[];

//Consts
export { CONFIG_VERSION };

/**
 * Module to handle the configuration file, validation, defaults and retrieval.
 * The setup is fully sync, as nothing else can start without the config.
 */
export default class ConfigStore /*does not extend TxModuleBase*/ {
    //Statics
    public static readonly Schema = ConfigSchemas_v2;
    public static readonly SchemaDefaults = getConfigDefaults(ConfigSchemas_v2) as TxConfigs;
    public static getEmptyConfigFile() {
        return { version: CONFIG_VERSION };
    }

    //Instance
    private readonly changelogFilePath = txEnv.profileSubPath('data', 'configChangelog.json');
    private readonly configFilePath = txEnv.profileSubPath('config.json');
    private readonly lockFilePath = txEnv.profileSubPath('config.lock');
    private readonly moduleRefreshCallbacks: RefreshConfigRegistry = []; //Modules are in boot order
    private unknownConfigs: ListOf<any>; //keeping so we can save it back
    private storedConfigs: PartialTxConfigs;
    private activeConfigs: TxConfigs;
    private changelog: ConfigChangelogEntry[] = [];

    constructor() {
        //Check lock file to prevent starting twice the same config file
        this.acquireLock();

        //Load raw file
        let fileRaw;
        try {
            fileRaw = fs.readFileSync(this.configFilePath, 'utf8');
        } catch (error) {
            fatalError.ConfigStore(10, [
                'Unable to read configuration file (filesystem error).',
                ['Path', this.configFilePath],
                ['Error', emsg(error)],
            ]);
        }

        //Json parse
        let fileData: ConfigFileData;
        try {
            fileData = JSON.parse(fileRaw);
        } catch (error) {
            fatalError.ConfigStore(11, [
                'Unable to parse configuration file (invalid JSON).',
                'This means the file somehow got corrupted and is not a valid anymore.',
                ['Path', this.configFilePath],
                ['Error', emsg(error)],
            ]);
        }

        //Check version & migrate if needed
        let fileMigrated = false;
        if (fileData?.version !== CONFIG_VERSION) {
            try {
                fileData = migrateConfigFile(fileData);
                fileMigrated = true;
            } catch (error) {
                fatalError.ConfigStore(
                    25,
                    [
                        'Unable to migrate configuration file.',
                        ['Path', this.configFilePath],
                        ['File version', String(fileData?.version)],
                        ['Supported version', String(CONFIG_VERSION)],
                    ],
                    error,
                );
            }
        }

        //Parse & validate
        try {
            const configItems = parseConfigFileData(fileData);
            if (!configItems.length) console.verbose.debug('Empty configuration file.');
            const config = bootstrapConfigProcessor(configItems, ConfigSchemas_v2, ConfigStore.SchemaDefaults);
            this.unknownConfigs = config.unknown;
            this.storedConfigs = config.stored as PartialTxConfigs;
            this.activeConfigs = config.active as TxConfigs;
        } catch (error) {
            fatalError.ConfigStore(14, ['Unable to process configuration file.'], error);
        }

        //If migrated, write the new file
        if (fileMigrated) {
            try {
                this.saveFile(this.storedConfigs);
            } catch (error) {
                fatalError.ConfigStore(
                    26,
                    ['Unable to save the updated config.json file.', ['Path', this.configFilePath]],
                    error,
                );
            }
        }

        //Reflect to global
        this.updatePublicConfig();

        //Load changelog
        setImmediate(() => {
            this.loadChangelog();
        });
    }

    /**
     * Mirrors the #config object to the public deep frozen config object
     */
    private updatePublicConfig() {
        (globalThis as any).txConfig = deepFreeze(structuredClone(this.activeConfigs));
    }

    /**
     * Returns the stored config object, with only the known keys
     */
    public getStoredConfig() {
        return structuredClone(this.storedConfigs);
    }

    /**
     * Returns the changelog
     * TODO: add filters to be used in pages like ban templates
     * TODO: increase CCLOG_SIZE_LIMIT to a few hundred
     * TODO: increase CCLOG_RETENTION to a year, or deprecate it in favor of a full log
     */
    public getChangelog() {
        return structuredClone(this.changelog);
    }

    /**
     * Applies an input config object to the stored and active configs, then saves it to the file
     */
    public saveConfigs(inputConfig: PartialTxConfigsToSave, author: string | null) {
        //Process each item
        const parsedInput = parseConfigFileData(inputConfig);
        const processed = runtimeConfigProcessor(parsedInput, ConfigSchemas_v2, this.storedConfigs, this.activeConfigs);

        //If nothing thrown, update the state, file, and
        this.saveFile(processed.stored);
        this.storedConfigs = processed.stored as PartialTxConfigs;
        this.activeConfigs = processed.active as TxConfigs;
        this.logChanges(author ?? 'txAdmin', processed.storedKeysChanges.list);
        this.updatePublicConfig(); //before callbacks
        this.processCallbacks(processed.activeKeysChanges);
        return processed.storedKeysChanges;
    }

    /**
     * Saves the config.json file, maintaining the unknown configs
     */
    private saveFile(toStore: PartialTxConfigs) {
        const outFile = {
            version: CONFIG_VERSION,
            ...this.unknownConfigs,
            ...toStore,
        };
        fs.writeFileSync(this.configFilePath, JSON.stringify(outFile, null, 2));
    }

    /**
     * Logs changes to logger and changelog file
     * FIXME: ignore banlist.templates? or join consequent changes?
     */
    private logChanges(author: string, keysUpdated: string[]) {
        if (!keysUpdated.length) return;

        for (const configKey of keysUpdated) {
            const configLogDefinition = getConfigChangeLogActionDefinition(configKey);
            const action = configLogDefinition
                ? `Changed config: ${configLogDefinition.label} (${configKey})`
                : `Changed config: ${configKey}`;

            txCore.logger.system.write(author, action, 'config', {
                actionId: configLogDefinition?.id,
            });
        }

        this.changelog.push({
            author,
            ts: Date.now(),
            keys: keysUpdated,
        });
        this.changelog = truncateConfigChangelog(this.changelog);
        setImmediate(async () => {
            try {
                const json = JSON.stringify({
                    version: CCLOG_VERSION,
                    log: this.changelog,
                });
                await fsp.writeFile(this.changelogFilePath, json);
            } catch (error) {
                console.warn(`Failed to save ${this.changelogFilePath} with message: ${emsg(error)}`);
            }
        });
    }

    /**
     * Loads the changelog file
     */
    private async loadChangelog() {
        try {
            const rawFileData = await fsp.readFile(this.changelogFilePath, 'utf8');
            const fileData = JSON.parse(rawFileData);
            if (fileData?.version !== CCLOG_VERSION) throw new Error(`invalid_version`);
            const changelogData = ConfigChangelogFileSchema.parse(fileData);
            this.changelog = truncateConfigChangelog(changelogData.log);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
                console.verbose.debug(`${this.changelogFilePath} not found, making a new one.`);
            } else if ((error as Error)?.message === 'invalid_version') {
                console.warn(`Failed to load ${this.changelogFilePath} due to invalid version.`);
                console.warn('Since this is not a critical file, it will be reset.');
            } else {
                console.warn(`Failed to load ${this.changelogFilePath} with message: ${emsg(error)}`);
                console.warn('Since this is not a critical file, it will be reset.');
            }
        }
    }

    /**
     * Process the callbacks for the modules that registered for config changes
     */
    private processCallbacks(updatedConfigs: UpdateConfigKeySet) {
        for (const txModule of this.moduleRefreshCallbacks) {
            if (!updatedConfigs.hasMatch(txModule.rules)) continue;
            setImmediate(() => {
                try {
                    console.verbose.debug(`Triggering update callback for module ${txModule.moduleName}`);
                    txModule.callback(updatedConfigs);
                } catch (error) {
                    console.error(`Error in config update callback for module ${txModule.moduleName}: ${emsg(error)}`);
                    console.verbose.dir(error);
                }
            });
        }
    }

    /**
     * Register a callback to be called when the config is updated
     */
    public registerUpdateCallback(moduleName: string, rules: string[], callback: RefreshConfigFunc) {
        this.moduleRefreshCallbacks.push({
            moduleName,
            callback,
            rules,
        });
    }

    /**
     * Acquires a lock file to prevent multiple instances from using the same config.
     * If a lock exists with a running PID, it will fatal error.
     */
    private acquireLock() {
        try {
            const lockData = fs.readFileSync(this.lockFilePath, 'utf8').trim();
            const lockPid = parseInt(lockData);
            if (!isNaN(lockPid)) {
                try {
                    process.kill(lockPid, 0); //signal 0 = check if alive
                    fatalError.ConfigStore(12, [
                        'Another instance is already using this config file.',
                        ['Lock PID', String(lockPid)],
                        ['Lock file', this.lockFilePath],
                        'If this is incorrect, delete the lock file and try again.',
                    ]);
                } catch {
                    //PID not running — stale lock, safe to overwrite
                }
            }
        } catch {
            //Lock file doesn't exist, proceed
        }
        fs.writeFileSync(this.lockFilePath, String(process.pid));
        process.on('exit', () => this.releaseLock());
    }

    /**
     * Releases the lock file on shutdown
     */
    private releaseLock() {
        try {
            fs.unlinkSync(this.lockFilePath);
        } catch {
            //Ignore — file may already be gone
        }
    }
}
