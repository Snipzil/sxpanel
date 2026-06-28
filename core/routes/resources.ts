const modulename = 'WebServer:Resources';
import path from 'node:path';
import slash from 'slash';
import slug from 'slug';
import type { AuthedCtx } from '@modules/WebServer/ctxTypes';
import consoleFactory from '@lib/console';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
const console = consoleFactory(modulename);

//Helper functions
const isUndefined = (x: unknown): x is undefined => x === undefined;
const breakPath = (inPath: string) => slash(path.normalize(inPath)).split('/').filter(String);
const dynamicSort = (prop: string) => {
    let sortOrder = 1;
    if (prop[0] === '-') {
        sortOrder = -1;
        prop = prop.substr(1);
    }
    return function (a: any, b: any) {
        const result = a[prop] < b[prop] ? -1 : a[prop] > b[prop] ? 1 : 0;
        return result * sortOrder;
    };
};
const getResourceSubPath = (resPath: string): string => {
    if (resPath.indexOf('system_resources') >= 0) return 'system_resources';
    if (!path.isAbsolute(resPath)) return resPath;

    const serverDataPathArr = breakPath(`${txConfig.server.dataPath}/resources`);
    let resPathArr: (string | undefined)[] = breakPath(resPath);
    for (let i = 0; i < serverDataPathArr.length; i++) {
        if (isUndefined(resPathArr[i])) break;
        if (serverDataPathArr[i].toLowerCase() == resPathArr[i]!.toLowerCase()) {
            resPathArr[i] = undefined;
        }
    }
    resPathArr.pop();
    const filtered = resPathArr.filter((s): s is string => typeof s === 'string' && s.length > 0);

    if (filtered.length) {
        return filtered.join('/');
    } else {
        return 'root';
    }
};

interface ResourceReport {
    name?: string;
    status?: string;
    path?: string;
    version?: string;
    author?: string;
    description?: string;
}

interface ResData {
    name: string;
    divName: string;
    status: string;
    statusClass: string;
    version: string;
    author: string;
    description: string;
}

interface ResGroup {
    subPath: string;
    divName: string;
    resources: ResData[];
}

/**
 * Returns the resources list
 */
export default async function Resources(ctx: AuthedCtx) {
    if (!txCore.fxRunner.child?.isAlive) {
        return ctx.utils.render('main/message', {
            message: '<strong>The resources list is only available when the server is running.</strong>',
        });
    }

    const timeoutMessage = `<strong>Couldn't load the resources list.</strong> <br>
    - Make sure the server is online (try to join it). <br>
    - Make sure you don't have more than 1000 resources. <br>
    - Make sure you are not running the FXServer outside of sxPanel. <br>
    - Check the <strong>Live Console</strong> for any errors which may indicate that some resource has a malformed <code>fxmanifest.lua</code> file.`;

    //Send command request
    const cmdSuccess = txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
    if (!cmdSuccess) {
        return ctx.utils.render('main/message', { message: timeoutMessage });
    }

    //Timer for list delivery
    let tListTimer: ReturnType<typeof setInterval>;
    let tErrorTimer: ReturnType<typeof setTimeout>;
    const tList = new Promise<[string, Record<string, unknown>]>((resolve) => {
        tListTimer = setInterval(() => {
            if (
                txCore.fxResources.resourceReport &&
                Date.now() - new Date(txCore.fxResources.resourceReport.ts).getTime() <= 1000 &&
                Array.isArray(txCore.fxResources.resourceReport.resources)
            ) {
                clearInterval(tListTimer);
                clearTimeout(tErrorTimer);
                const resGroups = processResources(txCore.fxResources.resourceReport.resources);
                const renderData = {
                    headerTitle: 'Resources',
                    resGroupsJS: JSON.stringify(resGroups),
                    resGroups,
                    disableActions: ctx.admin.hasPermission('commands.resources') ? '' : 'disabled',
                };
                resolve(['main/resources', renderData]);
            }
        }, 100);
    });

    //Timer for timing out
    const tError = new Promise<[string, Record<string, unknown>]>((resolve) => {
        tErrorTimer = setTimeout(() => {
            clearInterval(tListTimer);
            resolve(['main/message', { message: timeoutMessage }]);
        }, 1000);
    });

    //Start race and give output
    const [view, renderData] = await Promise.race([tList, tError]);
    return ctx.utils.render(view, renderData);
}

//================================================================
/**
 * Returns the Processed Resource list.
 */
function processResources(resList: ResourceReport[]): ResGroup[] {
    //Clean resource data and add it so an object separated by subpaths
    const resGroupList: Record<string, ResData[]> = {};
    resList.forEach((resource) => {
        if (
            isUndefined(resource.name) ||
            isUndefined(resource.status) ||
            isUndefined(resource.path) ||
            resource.path === ''
        ) {
            return;
        }
        const subPath = getResourceSubPath(resource.path);
        const resData: ResData = {
            name: resource.name,
            divName: slug(resource.name),
            status: resource.status,
            statusClass: resource.status === 'started' ? 'success' : 'danger',
            version: resource.version ? `(${resource.version.trim()})` : '',
            author: resource.author ? `${resource.author.trim()}` : '',
            description: resource.description ? resource.description.trim() : '',
        };

        if (Object.prototype.hasOwnProperty.call(resGroupList, subPath)) {
            resGroupList[subPath].push(resData);
        } else {
            resGroupList[subPath] = [resData];
        }
    });

    //Generate final array with subpaths and div ids
    const finalList: ResGroup[] = [];
    Object.keys(resGroupList).forEach((subPath) => {
        const subPathData: ResGroup = {
            subPath: subPath,
            divName: slug(subPath),
            resources: resGroupList[subPath].sort(dynamicSort('name')),
        };
        finalList.push(subPathData);
    });

    return finalList;
}
