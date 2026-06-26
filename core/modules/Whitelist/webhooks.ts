const modulename = 'Whitelist:Webhooks';
import consoleFactory from '@lib/console';
import type { WhitelistEventType } from '@shared/whitelistTypes';
import type { DatabaseWhitelistEventType } from '@modules/Database/databaseTypes';

const console = consoleFactory(modulename);

/**
 * POST configured webhooks for a whitelist lifecycle event.
 */
export async function dispatchWhitelistWebhooks(
    eventType: WhitelistEventType,
    payload: Omit<DatabaseWhitelistEventType, 'id' | 'type' | 'ts'>,
) {
    const hooks = txConfig.whitelist.webhooks ?? [];
    const matching = hooks.filter((hook) => hook.enabled && hook.events.includes(eventType));
    if (!matching.length) return;

    const body = {
        event: eventType,
        ts: Math.floor(Date.now() / 1000),
        serverName: txConfig.general.serverName,
        ...payload,
    };

    await Promise.allSettled(
        matching.map(async (hook) => {
            try {
                const res = await fetch(hook.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    console.verbose.warn(`Whitelist webhook ${hook.id} responded ${res.status}`);
                }
            } catch (error) {
                console.verbose.warn(`Whitelist webhook ${hook.id} failed: ${emsg(error)}`);
            }
        }),
    );
}
