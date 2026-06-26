import { DbInstance, SavePriority } from '../instance';
import consoleFactory from '@lib/console';
import {
    DatabaseWhitelistApplicationType,
    DatabaseWhitelistApprovalsType,
    DatabaseWhitelistEntryType,
    DatabaseWhitelistEventType,
    DatabaseWhitelistRequestsType,
} from '../databaseTypes';
import {
    DatabaseWhitelistApplicationSchema,
    DatabaseWhitelistEntrySchema,
    DatabaseWhitelistEventSchema,
} from '../databaseSchemas';
import { DuplicateKeyError, genWhitelistEventID, genWhitelistRequestID } from '../dbUtils';
import { WHITELIST_DEFAULT_WORKFLOW_ID } from '@shared/whitelistTypes';
import { now } from '@lib/misc';
const console = consoleFactory('DatabaseDao');

const WhitelistApplicationWithoutIdSchema = DatabaseWhitelistApplicationSchema.omit({ id: true });

const entryToApproval = (entry: DatabaseWhitelistEntryType): DatabaseWhitelistApprovalsType => ({
    identifier: entry.identifier,
    playerName: entry.playerName,
    playerAvatar: entry.playerAvatar,
    tsApproved: entry.tsGranted,
    approvedBy: entry.grantedBy,
});

const applicationToRequest = (app: DatabaseWhitelistApplicationType): DatabaseWhitelistRequestsType => ({
    id: app.id,
    license: app.license,
    playerDisplayName: app.playerDisplayName,
    playerPureName: app.playerPureName,
    discordTag: app.discordTag,
    discordAvatar: app.discordAvatar,
    tsLastAttempt: app.tsLastAttempt,
    workflowId: app.workflowId,
    status: app.status,
});

/**
 * Data access object for the database whitelist collections.
 */
export default class WhitelistDao {
    constructor(private readonly db: DbInstance) {}

    private get dbo() {
        if (!this.db.obj || !this.db.isReady) throw new Error(`database not ready yet`);
        return this.db.obj;
    }

    private get chain() {
        if (!this.db.obj || !this.db.isReady) throw new Error(`database not ready yet`);
        return this.db.obj.chain;
    }

    // --- Entries ---

    findManyEntries(
        filter?: Partial<DatabaseWhitelistEntryType> | ((item: DatabaseWhitelistEntryType) => boolean),
    ): DatabaseWhitelistEntryType[] {
        return this.chain
            .get('whitelistEntries')
            .filter(filter as any)
            .cloneDeep()
            .value();
    }

    findEntryByIdentifier(identifier: string): DatabaseWhitelistEntryType | undefined {
        return this.chain.get('whitelistEntries').find({ identifier }).value();
    }

    removeManyEntries(
        filter: Partial<DatabaseWhitelistEntryType> | ((item: DatabaseWhitelistEntryType) => boolean),
    ): DatabaseWhitelistEntryType[] {
        this.db.writeFlag(SavePriority.MEDIUM);
        return this.chain
            .get('whitelistEntries')
            .remove(filter as any)
            .value();
    }

    registerEntry(entry: DatabaseWhitelistEntryType): void {
        DatabaseWhitelistEntrySchema.parse(entry);

        const found = this.chain.get('whitelistEntries').filter({ identifier: entry.identifier }).value();
        if (found.length) throw new DuplicateKeyError(`this identifier is already whitelisted`);

        this.db.writeFlag(SavePriority.LOW);
        this.chain.get('whitelistEntries').push(structuredClone(entry)).value();
    }

    consumeEntry(identifier: string, tsFirstConnect: number): DatabaseWhitelistEntryType | undefined {
        const entryRef = this.chain.get('whitelistEntries').find({ identifier });
        const entry = entryRef.value();
        if (!entry) return undefined;
        this.db.writeFlag(SavePriority.LOW);
        return entryRef.assign({ tsFirstConnect }).cloneDeep().value();
    }

    // --- Applications ---

    findManyApplications(
        filter?: Partial<DatabaseWhitelistApplicationType> | ((item: DatabaseWhitelistApplicationType) => boolean),
    ): DatabaseWhitelistApplicationType[] {
        return this.chain
            .get('whitelistApplications')
            .filter(filter as any)
            .cloneDeep()
            .value();
    }

    removeManyApplications(
        filter: Partial<DatabaseWhitelistApplicationType> | ((item: DatabaseWhitelistApplicationType) => boolean),
    ): DatabaseWhitelistApplicationType[] {
        this.db.writeFlag(SavePriority.LOW);
        return this.chain
            .get('whitelistApplications')
            .remove(filter as any)
            .value();
    }

    updateApplication(
        license: string,
        srcData: Partial<Omit<DatabaseWhitelistApplicationType, 'id' | 'license'>>,
    ): DatabaseWhitelistApplicationType {
        if ('id' in srcData || 'license' in srcData) {
            throw new Error(`cannot update id or license fields`);
        }

        const appDbObj = this.chain.get('whitelistApplications').find({ license });
        if (!appDbObj.value()) throw new Error('Application not found in database');
        this.db.writeFlag(SavePriority.LOW);
        return appDbObj.assign(structuredClone(srcData)).cloneDeep().value();
    }

    registerApplication(application: Omit<DatabaseWhitelistApplicationType, 'id'>): DatabaseWhitelistApplicationType {
        WhitelistApplicationWithoutIdSchema.parse(application);
        if ('id' in application) {
            throw new Error(`cannot manually set the id field`);
        }

        const id = genWhitelistRequestID(this.dbo);
        this.db.writeFlag(SavePriority.LOW);
        const saved = { id, ...structuredClone(application) };
        this.chain.get('whitelistApplications').push(saved).value();
        return saved;
    }

    // --- Events ---

    findManyEvents(
        filter?: Partial<DatabaseWhitelistEventType> | ((item: DatabaseWhitelistEventType) => boolean),
    ): DatabaseWhitelistEventType[] {
        return this.chain
            .get('whitelistEvents')
            .filter(filter as any)
            .cloneDeep()
            .value();
    }

    recordEvent(event: Omit<DatabaseWhitelistEventType, 'id' | 'ts'> & { id?: string; ts?: number }): string {
        const id = event.id ?? genWhitelistEventID(this.dbo);
        const ts = event.ts ?? now();
        const record: DatabaseWhitelistEventType = {
            ...structuredClone(event),
            id,
            ts,
        };
        DatabaseWhitelistEventSchema.parse(record);
        this.db.writeFlag(SavePriority.LOW);
        this.chain.get('whitelistEvents').push(record).value();
        return id;
    }

    // --- API-compatible aliases ---

    findManyApprovals(
        filter?: Partial<DatabaseWhitelistApprovalsType> | ((item: DatabaseWhitelistApprovalsType) => boolean),
    ): DatabaseWhitelistApprovalsType[] {
        const pendingFilter = (entry: DatabaseWhitelistEntryType) => typeof entry.tsFirstConnect !== 'number';
        let entries = this.findManyEntries(pendingFilter);
        if (filter) {
            const approvals = entries.map(entryToApproval);
            if (typeof filter === 'function') {
                return approvals.filter(filter);
            }
            return approvals.filter((item) =>
                Object.entries(filter).every(([key, value]) => (item as any)[key] === value),
            );
        }
        return entries.map(entryToApproval);
    }

    removeManyApprovals(
        filter: Partial<DatabaseWhitelistApprovalsType> | ((item: DatabaseWhitelistApprovalsType) => boolean),
    ): DatabaseWhitelistApprovalsType[] {
        const match = this.findManyApprovals(filter);
        const identifiers = new Set(match.map((m) => m.identifier));
        this.removeManyEntries(
            (entry) => identifiers.has(entry.identifier) && typeof entry.tsFirstConnect !== 'number',
        );
        return match;
    }

    registerApproval(approval: DatabaseWhitelistApprovalsType): void {
        const license = approval.identifier.startsWith('license:') ? approval.identifier.substring(8) : undefined;
        this.registerEntry({
            identifier: approval.identifier,
            tsGranted: approval.tsApproved,
            grantedBy: approval.approvedBy,
            source: 'manual',
            playerName: approval.playerName,
            playerAvatar: approval.playerAvatar,
            license,
        });
    }

    findManyRequests(
        filter?: Partial<DatabaseWhitelistRequestsType> | ((item: DatabaseWhitelistRequestsType) => boolean),
    ): DatabaseWhitelistRequestsType[] {
        const pending = this.findManyApplications({ status: 'pending' });
        let requests = pending.map(applicationToRequest);
        if (!filter) return requests;
        if (typeof filter === 'function') return requests.filter(filter);
        return requests.filter((item) => Object.entries(filter).every(([key, value]) => (item as any)[key] === value));
    }

    removeManyRequests(
        filter: Partial<DatabaseWhitelistRequestsType> | ((item: DatabaseWhitelistRequestsType) => boolean),
    ): DatabaseWhitelistRequestsType[] {
        const match = this.findManyRequests(filter);
        const ids = new Set(match.map((m) => m.id));
        this.removeManyApplications((app) => ids.has(app.id));
        return match;
    }

    updateRequest(
        license: string,
        srcData: Partial<Omit<DatabaseWhitelistRequestsType, 'id' | 'license'>>,
    ): DatabaseWhitelistRequestsType {
        const updated = this.updateApplication(license, {
            ...srcData,
            tsLastAttempt: srcData.tsLastAttempt ?? now(),
        });
        return applicationToRequest(updated);
    }

    registerRequest(request: Omit<DatabaseWhitelistRequestsType, 'id'>): string {
        const saved = this.registerApplication({
            license: request.license,
            status: 'pending',
            workflowId: WHITELIST_DEFAULT_WORKFLOW_ID,
            playerDisplayName: request.playerDisplayName,
            playerPureName: request.playerPureName,
            discordTag: request.discordTag,
            discordAvatar: request.discordAvatar,
            tsCreated: request.tsLastAttempt,
            tsLastAttempt: request.tsLastAttempt,
        });
        return saved.id;
    }
}
