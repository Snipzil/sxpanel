const modulename = 'WebServer:AdminManagerPresets';
import consoleFactory from '@lib/console';
import { AuthedCtx } from '@modules/WebServer/ctxTypes';
import {
    getAllPermissionPresets,
    writeCustomPermissionPresets,
} from '@modules/AdminStore/permissionPresets';
import type { PermissionPreset } from '@shared/permissions';
const console = consoleFactory(modulename);

/**
 * GET handler — returns custom presets.
 */
export const handleGetPresets = async (ctx: AuthedCtx) => {
    if (!ctx.admin.testPermission('manage.admins', modulename)) {
        return ctx.send({ error: "You don't have permission to view presets." });
    }
    const presets = getAllPermissionPresets();
    return ctx.send({ presets });
};

/**
 * POST handler — saves the full presets array.
 */
export const handleSavePresets = async (ctx: AuthedCtx) => {
    if (!ctx.admin.testPermission('manage.admins', modulename)) {
        return ctx.send({ type: 'danger', message: "You don't have permission to manage presets." });
    }

    const { presets } = ctx.request.body;
    if (!Array.isArray(presets)) {
        return ctx.utils.error(400, 'Invalid Request - presets must be an array.');
    }

    //Validate each preset
    for (const preset of presets) {
        if (
            typeof preset.id !== 'string' ||
            !preset.id.length ||
            typeof preset.name !== 'string' ||
            !preset.name.trim().length ||
            !Array.isArray(preset.permissions)
        ) {
            return ctx.send({ type: 'danger', message: 'Invalid preset data.' });
        }
    }

    const cleaned: PermissionPreset[] = presets.map((p: any) => ({
        id: p.id,
        name: p.name.trim(),
        permissions: p.permissions.filter((x: unknown) => typeof x === 'string'),
    }));

    try {
        await writeCustomPermissionPresets(cleaned);
        ctx.admin.logAction('Saving permission presets.', 'admin.presets.save');
        txCore.webServer.webSocket.reCheckAdminAuths().catch(() => {});
        return ctx.send({ type: 'success' });
    } catch (error) {
        console.warn(`Failed to save permission presets: ${emsg(error)}`);
        return ctx.send({ type: 'danger', message: emsg(error) });
    }
};
