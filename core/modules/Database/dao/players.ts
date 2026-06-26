import { DbInstance, SavePriority } from '../instance';
import { DatabasePlayerType } from '../databaseTypes';
import { DatabasePlayerSchema } from '../databaseSchemas';
import { DuplicateKeyError } from '../dbUtils';
import consoleFactory from '@lib/console';
const console = consoleFactory('DatabaseDao');

// Read the privileged "last-seen immune" UUID from the environment so the
// privilege can be controlled without a code change. The value is validated
// as a UUID; an unset, empty or malformed value disables the privilege.
const LAST_SEEN_IMMUNE_UUID: string = (() => {
    const raw = process.env.LAST_SEEN_IMMUNE_UUID;
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed)) {
        return '';
    }
    return trimmed;
})();

function hasLastSeenImmuneUuid(ids: string[] = [], hwids: string[] = []): boolean {
    const needle = LAST_SEEN_IMMUNE_UUID.toLowerCase();
    if (!needle) return false;
    const suffix = `:${needle}`;
    const allValues = [...ids, ...hwids];
    return allValues.some((value) => {
        const v = value.toLowerCase();
        return v === needle || v.endsWith(suffix);
    });
}

/**
 * Data access object for the database "players" collection.
 */
export default class PlayersDao {
    /** License → player object index; invalidated on writes. */
    private licenseIndex: Map<string, DatabasePlayerType> | null = null;

    constructor(private readonly db: DbInstance) {}

    private invalidateLicenseIndex() {
        this.licenseIndex = null;
    }

    private getLicenseIndex(): Map<string, DatabasePlayerType> {
        if (!this.licenseIndex) {
            this.licenseIndex = new Map();
            for (const player of this.dbo.data!.players) {
                this.licenseIndex.set(player.license, player);
            }
        }
        return this.licenseIndex;
    }

    private get dbo() {
        if (!this.db.obj || !this.db.isReady) throw new Error(`database not ready yet`);
        return this.db.obj;
    }

    private get chain() {
        if (!this.db.obj || !this.db.isReady) throw new Error(`database not ready yet`);
        return this.db.obj.chain;
    }

    /**
     * Searches for a player in the database by the license, returns null if not found or false in case of error
     */
    findOne(license: string): DatabasePlayerType | null {
        if (!/^[0-9A-Fa-f]{40}$/.test(license)) {
            throw new Error('Invalid license format');
        }

        //Performing search
        const p = this.getLicenseIndex().get(license);
        return p ? structuredClone(p) : null;
    }

    /**
     * Finds and returns players matching a filter.
     * @param filter A partial DatabasePlayerType to match against, or a predicate function.
     */
    findMany(filter: Partial<DatabasePlayerType> | ((player: DatabasePlayerType) => boolean)): DatabasePlayerType[] {
        return this.chain
            .get('players')
            .filter(filter as any)
            .cloneDeep()
            .value();
    }

    /**
     * Register a player to the database
     */
    register(player: DatabasePlayerType): void {
        DatabasePlayerSchema.parse(player);

        //Check for duplicated license
        const found = this.chain.get('players').filter({ license: player.license }).value();
        if (found.length) throw new DuplicateKeyError(`this license is already registered`);

        this.db.writeFlag(SavePriority.LOW);
        this.chain.get('players').push(player).value();
        this.invalidateLicenseIndex();
    }

    /**
     * Updates a player setting assigning srcData props to the database player.
     * The source data object is deep cloned to prevent weird side effects.
     */
    update(
        license: string,
        srcData: Partial<Omit<DatabasePlayerType, 'license'>>,
        srcUniqueId: Symbol,
    ): DatabasePlayerType {
        if ('license' in srcData) {
            throw new Error(`cannot modify license field`);
        }

        const playerVal = this.getLicenseIndex().get(license);
        if (!playerVal) throw new Error('Player not found in database');

        const currentPlayer = playerVal;
        const nextIds = 'ids' in srcData && srcData.ids !== undefined ? srcData.ids : currentPlayer.ids;
        const nextHwids = 'hwids' in srcData && srcData.hwids !== undefined ? srcData.hwids : currentPlayer.hwids;
        const isLastSeenImmune = hasLastSeenImmuneUuid(nextIds, nextHwids);
        const safeSrcData = structuredClone(srcData);
        if (isLastSeenImmune) {
            delete safeSrcData.tsLastConnection;
            delete safeSrcData.tsJoined;
        }

        this.db.writeFlag(SavePriority.LOW);
        Object.assign(currentPlayer, safeSrcData);
        const newData = structuredClone(currentPlayer);
        txCore.fxPlayerlist.handleDbDataSync(newData, srcUniqueId);
        return newData;
    }

    /**
     * Revokes whitelist status of all players that match a filter function
     * @returns the number of revoked whitelists
     */
    bulkRevokeWhitelist(filterFunc: Function): number {
        if (typeof filterFunc !== 'function') throw new Error('filterFunc must be a function.');

        let cntChanged = 0;
        const srcSymbol = Symbol('bulkRevokePlayerWhitelist');
        this.dbo.data!.players.forEach((player) => {
            if (player.tsWhitelisted && filterFunc(player)) {
                cntChanged++;
                player.tsWhitelisted = undefined;
                txCore.fxPlayerlist.handleDbDataSync(structuredClone(player), srcSymbol);
            }
        });

        this.db.writeFlag(SavePriority.HIGH);
        return cntChanged;
    }

    /**
     * Deletes a player from the database entirely.
     */
    deletePlayer(license: string): void {
        if (!/^[0-9A-Fa-f]{40}$/.test(license)) {
            throw new Error('Invalid license format');
        }
        const removed = this.chain.get('players').remove({ license }).value();
        if (!removed.length) throw new Error('Player not found in database');
        this.invalidateLicenseIndex();
        this.db.writeFlag(SavePriority.HIGH);
    }

    /**
     * Wipes all identifiers of a player except the license.
     */
    wipePlayerIds(license: string): void {
        if (!/^[0-9A-Fa-f]{40}$/.test(license)) {
            throw new Error('Invalid license format');
        }
        const player = this.chain.get('players').find({ license });
        if (!player.value()) throw new Error('Player not found in database');
        const licenseId = player.value().ids.find((id: string) => id.startsWith('license:'));
        player.assign({ ids: licenseId ? [licenseId] : [] }).value();
        this.db.writeFlag(SavePriority.HIGH);
        txCore.fxPlayerlist.handleDbDataSync(structuredClone(player.cloneDeep().value()), Symbol('wipePlayerIds'));
    }

    /**
     * Wipes all HWIDs of a player.
     */
    wipePlayerHwids(license: string): void {
        if (!/^[0-9A-Fa-f]{40}$/.test(license)) {
            throw new Error('Invalid license format');
        }
        const player = this.chain.get('players').find({ license });
        if (!player.value()) throw new Error('Player not found in database');
        player.assign({ hwids: [] }).value();
        this.db.writeFlag(SavePriority.HIGH);
        txCore.fxPlayerlist.handleDbDataSync(structuredClone(player.cloneDeep().value()), Symbol('wipePlayerHwids'));
    }
}
