const modulename = 'WebServer:AdminManagerApi';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
const console = consoleFactory(modulename);

/**
 * Returns the admin list as JSON for the React panel.
 */
export default async function AdminManagerList(ctx: AuthedCtx) {
    //Check permissions
    if (!ctx.admin.testPermission('manage.admins', modulename)) {
        return ctx.send({ error: "You don't have permission to view the admin list." });
    }

    const currentAdminName = ctx.admin.name.toLowerCase();

    //Build set of online admin identifiers from playerlist
    const onlineIdentifiers = new Set<string>();
    try {
        const playerList = txCore.fxPlayerlist.getPlayerList();
        for (const p of playerList) {
            for (const id of p.ids) {
                onlineIdentifiers.add(id.toLowerCase());
            }
        }
    } catch (_) {
        /* playerlist may not be available */
    }

    const rawAdmins = txCore.adminStore.getRawAdminsList();
    const admins = rawAdmins.map((admin: any) => {
        //Check if any of the admin's provider identifiers are in the online set
        let isOnline = false;
        for (const providerName of Object.keys(admin.providers)) {
            const identifier = admin.providers[providerName]?.identifier;
            if (identifier && onlineIdentifiers.has(identifier.toLowerCase())) {
                isOnline = true;
                break;
            }
        }

        const isYou = currentAdminName === admin.name.toLowerCase();

        return {
            name: admin.name,
            isMaster: admin.master,
            hasCitizenFx: !!admin.providers.citizenfx,
            citizenfxId: admin.providers.citizenfx?.identifier ?? '',
            hasDiscord: !!admin.providers.discord,
            discordId: admin.providers.discord?.id ?? '',
            permissions: admin.permissions,
            ...(isYou ? { effectivePermissions: ctx.admin.permissions } : {}),
            isYou,
            isOnline,
        };
    });

    return ctx.send({ admins });
}
