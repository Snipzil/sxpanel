//NOTE: don't import anything at the root of this file or it breaks the type definitions

/**
 * MARK: fxPanel stuff
 */
type RefreshConfigFunc = import('@modules/ConfigStore/').RefreshConfigFunc;
interface GenericTxModuleInstance {
    handleConfigUpdate?: RefreshConfigFunc;
    handleShutdown?: () => void;
    timers?: ReturnType<typeof setInterval>[];
    // measureMemory?: () => { [key: string]: number };
}
declare interface GenericTxModule<T> {
    new (): InstanceType<T> & GenericTxModuleInstance;
    readonly configKeysWatched?: string[];
}

declare type TxConfigs = import('@modules/ConfigStore/schema').TxConfigs;
declare const txConfig: import('utility-types').DeepReadonly<TxConfigs>;

declare type TxCoreType = import('./txAdmin').TxCoreType;
declare const txCore: TxCoreType;

declare type TxManagerType = import('./txManager').TxManagerType;
declare const txManager: TxManagerType;

declare type TxConsole = import('./lib/console').TxConsole;
declare namespace globalThis {
    interface Console extends TxConsole {}
}

/**
 * MARK: Utilities
 */
declare function emsg(e: unknown): string;

/**
 * MARK: Natives
 * Natives extracted from https://www.npmjs.com/package/@citizenfx/server
 * I prefer extracting than importing the whole package because it's
 * easier to keep track of what natives are being used.
 *
 * To use the package, add the following line to the top of the file:
 * /// <reference types="@citizenfx/server" />
 */
declare function ExecuteCommand(commandString: string): void;
declare function GetConvar(varName: string, default_: string): string;
declare function GetCurrentResourceName(): string;
declare function GetPasswordHash(password: string): string;
declare function GetResourceMetadata(resourceName: string, metadataKey: string, index: number): string;
declare function GetResourcePath(resourceName: string): string;
declare function IsDuplicityVersion(): boolean;
declare function PrintStructuredTrace(payload: string): void;
declare function RegisterCommand(commandName: string, handler: Function, restricted: boolean): void;
declare function ScanResourceRoot(rootPath: string, callback: (data: object) => void): boolean;
declare function VerifyPasswordHash(password: string, hash: string): boolean;

/**
 * MARK: Fixes
 */
