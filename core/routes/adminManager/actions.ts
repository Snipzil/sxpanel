const modulename = 'WebServer:AdminManagerActions';
import { customAlphabet } from 'nanoid';
import { nolookalikes } from 'nanoid-dictionary';
import got from '@lib/got';
import consts from '@shared/consts';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
const console = consoleFactory(modulename);

//Helpers
const nanoid = customAlphabet(nolookalikes, 20);
//NOTE: this desc misses that it should start and end with alphanum or _, and cannot have repeated -_.
const nameRegexDesc = 'up to 20 characters containing only letters, numbers and the characters \`_.-\`';
const cfxHttpReqOptions = {
    timeout: { request: 6000 },
};
type ProviderDataType = { id: string; identifier: string };

/**
 * Returns the output page containing the admins.
 */
export default async function AdminManagerActions(ctx: AuthedCtx) {
    //Sanity check
    if (typeof ctx.params?.action !== 'string') {
        return ctx.utils.error(400, 'Invalid Request');
    }
    const action = ctx.params.action;

    //Check permissions
    if (!ctx.admin.testPermission('manage.admins', modulename)) {
        return ctx.send({
            type: 'danger',
            message: "You don't have permission to execute this action.",
        });
    }

    //Delegate to the specific action handler
    if (action == 'add') {
        return await handleAdd(ctx);
    } else if (action == 'edit') {
        return await handleEdit(ctx);
    } else if (action == 'delete') {
        return await handleDelete(ctx);
    } else if (action == 'resetPassword') {
        return await handleResetPassword(ctx);
    } else {
        return ctx.send({
            type: 'danger',
            message: 'Unknown action.',
        });
    }
}

/**
 * Handle Add
 */
async function handleAdd(ctx: AuthedCtx) {
    //Accept both legacy (citizenfxID/discordID) and new (citizenfxId/discordId) field names
    const body = ctx.request.body;
    const rawName = body.name;
    const rawCfxId = body.citizenfxID ?? body.citizenfxId ?? '';
    const rawDiscordId = body.discordID ?? body.discordId ?? '';

    //Sanity check
    if (
        typeof rawName !== 'string' ||
        typeof rawCfxId !== 'string' ||
        typeof rawDiscordId !== 'string' ||
        body.permissions === undefined
    ) {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }

    //Prepare and filter variables
    const name = rawName.trim();
    const password = nanoid();
    const citizenfxID = rawCfxId.trim();
    const discordID = rawDiscordId.trim();
    let permissions = Array.isArray(body.permissions) ? body.permissions : [];
    permissions = permissions.filter((x: unknown) => typeof x === 'string');
    if (permissions.includes('all_permissions')) permissions = ['all_permissions'];

    //Validate name
    if (!consts.regexValidFivemUsername.test(name)) {
        return ctx.send({
            type: 'danger',
            markdown: true,
            message: `**Invalid username, it must follow the rule:**\n${nameRegexDesc}`,
        });
    }

    //Validate & translate FiveM ID
    let citizenfxData: ProviderDataType | undefined;
    if (citizenfxID.length) {
        try {
            if (consts.validIdentifiers.fivem.test(citizenfxID)) {
                const id = citizenfxID.split(':')[1];
                const res = await got(
                    `https://policy-live.fivem.net/api/getUserInfo/${id}`,
                    cfxHttpReqOptions,
                ).json<any>();
                if (!res.username || !res.username.length) {
                    return ctx.send({ type: 'danger', message: 'Invalid CitizenFX ID1' });
                }
                citizenfxData = {
                    id: res.username,
                    identifier: citizenfxID,
                };
            } else if (consts.regexValidFivemUsername.test(citizenfxID)) {
                const res = await got(`https://forum.cfx.re/u/${citizenfxID}.json`, cfxHttpReqOptions).json<any>();
                if (!res.user || typeof res.user.id !== 'number') {
                    return ctx.send({ type: 'danger', message: 'Invalid CitizenFX ID2' });
                }
                citizenfxData = {
                    id: citizenfxID,
                    identifier: `fivem:${res.user.id}`,
                };
            } else {
                return ctx.send({ type: 'danger', message: 'Invalid CitizenFX ID3' });
            }
        } catch (error) {
            console.error(`Failed to resolve CitizenFX ID to game identifier with error: ${emsg(error)}`);
            return ctx.send({
                type: 'danger',
                message: 'Failed to verify CitizenFX ID. Please try again or check the ID.',
            });
        }
    }

    //Validate Discord ID
    let discordData: ProviderDataType | undefined;
    if (discordID.length) {
        if (!consts.validIdentifierParts.discord.test(discordID)) {
            return ctx.send({ type: 'danger', message: 'Invalid Discord ID' });
        }
        discordData = {
            id: discordID,
            identifier: `discord:${discordID}`,
        };
    }

    //Check for privilege escalation
    if (!ctx.admin.isMaster && !ctx.admin.permissions.includes('all_permissions')) {
        const deniedPerms = permissions.filter((x: string) => !ctx.admin.permissions.includes(x));
        if (deniedPerms.length) {
            return ctx.send({
                type: 'danger',
                message: `You cannot give permissions you do not have:<br>${deniedPerms.join(', ')}`,
            });
        }
    }

    //Add admin and give output
    try {
        await txCore.adminStore.addAdmin(name, citizenfxData, discordData, password, permissions);
        ctx.admin.logAction(`Adding user '${name}'.`, 'admin.user.add');
        return ctx.send({ type: 'showPassword', password });
    } catch (error) {
        return ctx.send({ type: 'danger', message: emsg(error) });
    }
}

/**
 * Handle Edit
 */
async function handleEdit(ctx: AuthedCtx) {
    //Accept both legacy (citizenfxID/discordID) and new (citizenfxId/discordId) field names
    const body = ctx.request.body;
    const rawName = body.name;
    const rawOriginalName = body.originalName;
    const rawCfxId = body.citizenfxID ?? body.citizenfxId ?? '';
    const rawDiscordId = body.discordID ?? body.discordId ?? '';

    //Sanity check
    if (
        typeof rawName !== 'string' ||
        typeof rawCfxId !== 'string' ||
        typeof rawDiscordId !== 'string' ||
        body.permissions === undefined
    ) {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }

    //Prepare and filter variables
    const name = rawName.trim();
    const lookupName =
        typeof rawOriginalName === 'string' && rawOriginalName.trim().length ? rawOriginalName.trim() : name;
    const citizenfxID = rawCfxId.trim();
    const discordID = rawDiscordId.trim();

    //Check if editing himself
    if (ctx.admin.name.toLowerCase() === lookupName.toLowerCase()) {
        return ctx.send({ type: 'danger', message: '(ERR0) You cannot edit yourself.' });
    }

    //Validate & translate permissions
    let permissions;
    if (Array.isArray(body.permissions)) {
        permissions = body.permissions.filter((x: unknown) => typeof x === 'string');
        if (permissions.includes('all_permissions')) permissions = ['all_permissions'];
    } else {
        permissions = [];
    }

    //Validate & translate FiveM ID
    let citizenfxData: ProviderDataType | undefined;
    if (citizenfxID.length) {
        try {
            if (consts.validIdentifiers.fivem.test(citizenfxID)) {
                const id = citizenfxID.split(':')[1];
                const res = await got(
                    `https://policy-live.fivem.net/api/getUserInfo/${id}`,
                    cfxHttpReqOptions,
                ).json<any>();
                if (!res.username || !res.username.length) {
                    return ctx.send({ type: 'danger', message: '(ERR1) Invalid CitizenFX ID' });
                }
                citizenfxData = {
                    id: res.username,
                    identifier: citizenfxID,
                };
            } else if (consts.regexValidFivemUsername.test(citizenfxID)) {
                const res = await got(`https://forum.cfx.re/u/${citizenfxID}.json`, cfxHttpReqOptions).json<any>();
                if (!res.user || typeof res.user.id !== 'number') {
                    return ctx.send({ type: 'danger', message: '(ERR2) Invalid CitizenFX ID' });
                }
                citizenfxData = {
                    id: citizenfxID,
                    identifier: `fivem:${res.user.id}`,
                };
            } else {
                return ctx.send({ type: 'danger', message: '(ERR3) Invalid CitizenFX ID' });
            }
        } catch (error) {
            console.error(`Failed to resolve CitizenFX ID to game identifier with error: ${emsg(error)}`);
            return ctx.send({
                type: 'danger',
                message: 'Failed to verify CitizenFX ID. Please try again or check the ID.',
            });
        }
    }

    //Validate Discord ID
    let discordData: ProviderDataType | undefined | false;
    if (discordID.length) {
        if (!consts.validIdentifierParts.discord.test(discordID)) {
            return ctx.send({ type: 'danger', message: 'Invalid Discord ID' });
        }
        discordData = {
            id: discordID,
            identifier: `discord:${discordID}`,
        };
    } else {
        discordData = false;
    }

    //Check if admin exists (look up by original name if renaming)
    const admin = txCore.adminStore.getAdminByName(lookupName);
    if (!admin) return ctx.send({ type: 'danger', message: 'Admin not found.' });

    //Check if editing an master admin
    if (!ctx.admin.isMaster && admin.isMaster) {
        return ctx.send({ type: 'danger', message: 'You cannot edit an admin master.' });
    }

    //Check for privilege escalation
    if (permissions && !ctx.admin.isMaster && !ctx.admin.permissions.includes('all_permissions')) {
        const deniedPerms = permissions.filter((x: string) => !ctx.admin.permissions.includes(x));
        if (deniedPerms.length) {
            return ctx.send({
                type: 'danger',
                message: `You cannot give permissions you do not have:<br>${deniedPerms.join(', ')}`,
            });
        }
    }

    //Edit admin and optionally rename
    try {
        await txCore.adminStore.editAdmin(lookupName, null, citizenfxData, discordData, permissions);
        //Rename if name changed
        if (name.toLowerCase() !== lookupName.toLowerCase()) {
            await txCore.adminStore.renameAdmin(lookupName, name);
        }
        ctx.admin.logAction(`Editing user '${name}'.`, 'admin.user.edit');
        return ctx.send({ type: 'success', refresh: true });
    } catch (error) {
        return ctx.send({ type: 'danger', message: emsg(error) });
    }
}

/**
 * Handle Delete
 */
async function handleDelete(ctx: AuthedCtx) {
    //Sanity check
    if (typeof ctx.request.body.name !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }
    const name = ctx.request.body.name.trim();

    //Check if deleting himself
    if (ctx.admin.name.toLowerCase() === name.toLowerCase()) {
        return ctx.send({ type: 'danger', message: "You can't delete yourself." });
    }

    //Check if admin exists
    const admin = txCore.adminStore.getAdminByName(name);
    if (!admin) return ctx.send({ type: 'danger', message: 'Admin not found.' });

    //Check if editing an master admin
    if (admin.isMaster) {
        return ctx.send({ type: 'danger', message: 'You cannot delete an admin master.' });
    }

    //Delete admin and give output
    try {
        await txCore.adminStore.deleteAdmin(name);
        ctx.admin.logAction(`Deleting user '${name}'.`, 'admin.user.delete');
        return ctx.send({ type: 'success', refresh: true });
    } catch (error) {
        return ctx.send({ type: 'danger', message: emsg(error) });
    }
}

/**
 * Handle Reset Password
 */
async function handleResetPassword(ctx: AuthedCtx) {
    //Sanity check
    if (typeof ctx.request.body.name !== 'string') {
        return ctx.utils.error(400, 'Invalid Request - missing parameters');
    }
    const name = ctx.request.body.name.trim();

    //Check if resetting own password
    if (ctx.admin.name.toLowerCase() === name.toLowerCase()) {
        return ctx.send({
            type: 'danger',
            message: 'You cannot reset your own password here. Use the change password page instead.',
        });
    }

    //Check if admin exists
    const admin = txCore.adminStore.getAdminByName(name);
    if (!admin) return ctx.send({ type: 'danger', message: 'Admin not found.' });

    //Check if resetting a master admin
    if (!ctx.admin.isMaster && admin.isMaster) {
        return ctx.send({ type: 'danger', message: 'You cannot reset the password of an admin master.' });
    }

    //Generate new temp password and apply
    const password = nanoid();
    try {
        await txCore.adminStore.resetAdminPassword(name, password);
        ctx.admin.logAction(`Resetting password for user '${name}'.`, 'admin.user.password_reset');
        return ctx.send({ type: 'showPassword', password });
    } catch (error) {
        return ctx.send({ type: 'danger', message: emsg(error) });
    }
}
