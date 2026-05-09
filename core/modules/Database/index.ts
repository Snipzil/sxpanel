const modulename = 'Database';
import { DbInstance } from './instance';
import consoleFactory from '@lib/console';

import PlayersDao from './dao/players';
import ActionsDao from './dao/actions';
import WhitelistDao from './dao/whitelist';
import StatsDao from './dao/stats';
import CleanupDao from './dao/cleanup';
import BotAnalyticsDao from './dao/botAnalytics';
import TicketsDao from './dao/tickets';
import { TxConfigState } from '@shared/enums';
const console = consoleFactory(modulename);

/**
 * This module is a hub for all database-related operations.
 */
export default class Database {
    readonly #db: DbInstance;

    //Database Methods
    readonly players: PlayersDao;
    readonly actions: ActionsDao;
    readonly whitelist: WhitelistDao;
    readonly stats: StatsDao;
    readonly cleanup: CleanupDao;
    readonly botAnalytics: BotAnalyticsDao;
    readonly tickets: TicketsDao;
    /** @deprecated Use tickets */
    readonly reports: TicketsDao;

    constructor() {
        this.#db = new DbInstance();
        this.players = new PlayersDao(this.#db);
        this.actions = new ActionsDao(this.#db);
        this.whitelist = new WhitelistDao(this.#db);
        this.stats = new StatsDao(this.#db);
        this.cleanup = new CleanupDao(this.#db);
        this.botAnalytics = new BotAnalyticsDao(this.#db);
        this.tickets = new TicketsDao(this.#db);
        this.reports = this.tickets; // backwards compat alias

        // Wait for database to be ready, then build indexes
        this.#db
            .whenReady()
            .then(() => {
                this.actions.buildIndexes();
            })
            .catch((error) => {
                console.error('Failed to build database indexes:', error.message ?? error);
            });

        //Database optimization cron function
        const optimizerTask = () => {
            if (txManager.configState === TxConfigState.Ready) {
                this.cleanup.runDailyOptimizer();
            }
        };
        setTimeout(optimizerTask, 30_000);
        setInterval(optimizerTask, 24 * 60 * 60_000);
    }

    /**
     * Graceful shutdown handler - passing down to the db instance
     */
    public handleShutdown() {
        this.#db.handleShutdown();
    }

    /**
     * Returns if the lowdb instance is ready
     */
    get isReady() {
        return this.#db.isReady;
    }

    /**
     * Returns if size of the database file
     */
    get fileSize() {
        return (this.#db.obj?.adapter as any)?.fileSize;
    }

    /**
     * Returns the entire lowdb object. Please be careful with it :)
     */
    getDboRef() {
        if (!this.#db.obj) throw new Error(`database not ready yet`);
        return this.#db.obj;
    }
}
