const modulename = 'DBMigration';
import { genActionID } from './dbUtils.js';
import cleanPlayerName from '@shared/cleanPlayerName.js';
import { DATABASE_VERSION, defaultDatabase } from './consts.js';
import { now } from '@lib/misc.js';
import consoleFactory from '@lib/console.js';
import fatalError from '@lib/fatalError.js';
const console = consoleFactory(modulename);

/**
 * Handles the migration of the database
 */
export default async (dbo) => {
    if (dbo.data.version === DATABASE_VERSION) {
        return dbo;
    }
    if (typeof dbo.data.version !== 'number') {
        fatalError.Database(50, 'Your players database version is not a number!');
    }
    if (dbo.data.version > DATABASE_VERSION) {
        fatalError.Database(51, [
            `Your players database is on v${dbo.data.version}, and this fxPanel supports up to v${DATABASE_VERSION}.`,
            'This means you likely downgraded your fxPanel or FXServer.',
            'Please make sure your fxPanel is updated!',
            '',
            'If you want to downgrade FXServer (the "artifact") but keep fxPanel updated,',
            'you can move the updated "citizen/system_resources/monitor" folder',
            'to older FXserver artifact, replacing the old files.',
            `Alternatively, you can restore the database v${dbo.data.version} backup on the data folder.`,
        ]);
    }

    //Migrate database
    if (dbo.data.version < 1) {
        console.warn(`Updating your players database from v${dbo.data.version} to v1. Wiping all the data.`);
        dbo.data = structuredClone(defaultDatabase);
        dbo.data.version = 1;
        await dbo.write();
    }

    if (dbo.data.version === 1) {
        console.warn('Updating your players database from v1 to v2.');
        console.warn('This process will change any duplicated action ID and wipe pending whitelist.');
        const actionIDStore = new Set();
        const actionsToFix = [];
        dbo.chain
            .get('actions')
            .forEach((a) => {
                if (!actionIDStore.has(a.id)) {
                    actionIDStore.add(a.id);
                } else {
                    actionsToFix.push(a);
                }
            })
            .value();
        console.warn(`Actions to fix: ${actionsToFix.length}`);
        for (let i = 0; i < actionsToFix.length; i++) {
            const action = actionsToFix[i];
            action.id = genActionID(actionIDStore, action.type);
            actionIDStore.add(action.id);
        }
        dbo.data.pendingWL = [];
        dbo.data.version = 2;
        await dbo.write();
    }

    if (dbo.data.version === 2) {
        console.warn('Updating your players database from v2 to v3.');
        console.warn('This process will:');
        console.warn('\t- process player names for better readability/searchability');
        console.warn('\t- allow fxPanel to save old player identifiers');
        console.warn('\t- remove the whitelist action in favor of player property');
        console.warn('\t- remove empty notes');
        console.warn('\t- improve whitelist handling');
        console.warn('\t- changing warn action prefix from A to W');

        //Removing all whitelist actions
        const ts = now();
        const whitelists = new Map();
        dbo.data.actions = dbo.data.actions.filter((action) => {
            if (action.type !== 'whitelist') return true;
            if (
                (!action.expiration || action.expiration > ts) &&
                !action.revocation.timestamp &&
                action.identifiers.length &&
                typeof action.identifiers[0] === 'string' &&
                action.identifiers[0].startsWith('license:')
            ) {
                const license = action.identifiers[0].substring(8);
                whitelists.set(license, action.timestamp);
            }
            return false;
        });

        //Changing Warn actions id prefix to W
        dbo.data.actions.forEach((action) => {
            if (action.type === 'warn') {
                action.id = `W${action.id.substring(1)}`;
            }
        });

        //Migrating players
        for (const player of dbo.data.players) {
            const { displayName, pureName } = cleanPlayerName(player.name);
            player.displayName = displayName;
            player.pureName = pureName;
            player.name = undefined;
            player.ids = [`license:${player.license}`];

            //adding whitelist
            const tsWhitelisted = whitelists.get(player.license);
            if (tsWhitelisted) player.tsWhitelisted = tsWhitelisted;

            //removing empty notes
            if (!player.notes.text) player.notes = undefined;
        }

        //Setting new whitelist schema
        dbo.data.pendingWL = undefined;
        dbo.data.whitelistApprovals = [];
        dbo.data.whitelistRequests = [];

        //Saving db
        dbo.data.version = 3;
        await dbo.write();
    }

    if (dbo.data.version === 3) {
        console.warn('Updating your players database from v3 to v4.');
        console.warn('This process will add a HWIDs array to the player data.');
        console.warn("As well as rename 'action[].identifiers' to 'action[].ids'.");

        //Migrating players
        for (const player of dbo.data.players) {
            player.hwids = [];
        }

        //Migrating actions
        for (const action of dbo.data.actions) {
            action.ids = action.identifiers;
            action.identifiers = undefined;
        }

        //Saving db
        dbo.data.version = 4;
        await dbo.write();
    }

    if (dbo.data.version === 4) {
        console.warn('Updating your players database from v4 to v5.');
        console.warn('This process will allow for offline warns.');

        //Migrating actions
        for (const action of dbo.data.actions) {
            if (action.type === 'warn') {
                action.acked = true;
            }
        }

        //Saving db
        dbo.data.version = 5;
        await dbo.write();
    }

    if (dbo.data.version === 5) {
        console.warn('Updating your players database from v5 to v6.');
        console.warn('This process will:');
        console.warn('\t- make action revocation optional (remove from non-revoked actions)');
        console.warn('\t- remove warn expiration field');
        console.warn('\t- add player name history');

        //Migrating actions: make revocation optional, remove warn expiration
        for (const action of dbo.data.actions) {
            if (action.revocation && action.revocation.timestamp === null && action.revocation.author === null) {
                action.revocation = undefined;
            }
            if (action.type === 'warn' && 'expiration' in action) {
                action.expiration = undefined;
            }
        }

        //Migrating players: initialize nameHistory from current displayName
        for (const player of dbo.data.players) {
            player.nameHistory = [player.displayName];
        }

        //Saving db
        dbo.data.version = 6;
        await dbo.write();
    }

    if (dbo.data.version === 6) {
        console.warn('Updating your players database from v6 to v7.');
        console.warn('This process will migrate reports → tickets with new schema.');

        // Migrate old reports array to tickets array
        if (Array.isArray(dbo.data.reports) && dbo.data.reports.length) {
            dbo.data.tickets = dbo.data.reports.map((r) => {
                const categoryMap = {
                    playerReport: 'Player Report',
                    bugReport: 'Bug Report',
                    question: 'Question',
                };
                return {
                    id: 'TKT-' + r.id.replace(/^RPT-/, ''),
                    status: r.status === 'resolved' ? 'resolved' : r.status,
                    category: categoryMap[r.type] ?? r.type ?? 'Other',
                    reporter: { license: r.reporter.license, name: r.reporter.name, netid: r.reporter.netid },
                    targets: (r.targets ?? []).map((t) => ({ license: t.license, name: t.name, netid: t.netid })),
                    description: r.reason ?? '',
                    messages: (r.messages ?? []).map((m, idx) => ({
                        id: `msg-${idx}`,
                        author: m.author,
                        authorType: m.authorType,
                        content: m.content,
                        ts: m.ts,
                    })),
                    staffNotes: [],
                    logContext: r.logContext ?? { reporter: [], targets: [], world: [] },
                    claimedBy: undefined,
                    resolvedBy: r.resolvedBy ?? undefined,
                    tsCreated: r.tsCreated,
                    tsLastActivity: r.tsResolved ?? r.tsCreated,
                    tsResolved: r.tsResolved,
                };
            });
            console.warn(`Migrated ${dbo.data.tickets.length} reports to tickets.`);
        } else {
            dbo.data.tickets = [];
        }
        dbo.data.reports = undefined;

        dbo.data.version = 7;
        await dbo.write();
    }

    if (dbo.data.version === 7) {
        console.warn('Updating your players database from v7 to v8.');
        console.warn('This process will initialize Discord bot command analytics storage.');

        dbo.data.botCommandEvents = [];

        dbo.data.version = 8;
        await dbo.write();
    }

    if (dbo.data.version !== DATABASE_VERSION) {
        fatalError.Database(52, [
            'Unexpected migration error: Did not reach the expected database version.',
            `Your players database is on v${dbo.data.version}, but the expected version is v${DATABASE_VERSION}.`,
            'Please make sure your fxPanel is on the most updated version!',
        ]);
    }
    console.ok('Database migrated successfully');
    return dbo;
};
