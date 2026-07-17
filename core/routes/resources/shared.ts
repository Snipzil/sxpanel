import { glob } from 'node:fs/promises';
import fsp from 'node:fs/promises';
import path from 'node:path';
import slash from 'slash';
import { SYM_SYSTEM_AUTHOR } from '@lib/symbols';
import { ResourcesListResp, ResourceGroup, ResourceItemData } from '@shared/resourcesApiTypes';

export const RESOURCE_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export const MAX_RESOURCE_ZIP_FILES = 10_000;

/** Directories skipped during zip to avoid huge, irrelevant trees. */
export const RESOURCE_ZIP_SKIP_DIRECTORY_NAMES = [
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '__pycache__',
    '.turbo',
    '.yarn',
    '.pnpm-store',
    '.next',
    'dist',
    'build',
    '.cache',
] as const;

const RESOURCE_ZIP_SKIP_DIRECTORY_SET = new Set<string>(RESOURCE_ZIP_SKIP_DIRECTORY_NAMES);

const hasSkippedZipPathSegment = (relativePath: string): boolean => {
    const segments = slash(relativePath).split('/');
    return segments.some((segment) => RESOURCE_ZIP_SKIP_DIRECTORY_SET.has(segment));
};

const getGlobEntryRelativePath = (entry: { name: string; parentPath?: string; path?: string }, cwd: string): string => {
    const parentPath =
        typeof entry.parentPath === 'string' ? entry.parentPath : typeof entry.path === 'string' ? entry.path : '';
    const combined = slash(parentPath ? path.join(parentPath, entry.name) : entry.name);
    if (path.isAbsolute(combined)) {
        return slash(path.relative(cwd, combined));
    }
    return combined;
};

const isUndefined = (x: unknown): x is undefined => x === undefined;
const breakPath = (inPath: string) => slash(path.normalize(inPath)).split('/').filter(String);

export const getResourceSubPath = (resPath: string): string => {
    if (resPath.indexOf('system_resources') >= 0) return 'system_resources';
    if (!path.isAbsolute(resPath)) return resPath;

    const serverDataPathArr = breakPath(`${txConfig.server.dataPath}/resources`);
    let resPathArr = breakPath(resPath);
    for (let i = 0; i < serverDataPathArr.length; i++) {
        if (isUndefined(resPathArr[i])) break;
        if (serverDataPathArr[i].toLowerCase() === resPathArr[i].toLowerCase()) {
            delete resPathArr[i];
        }
    }
    resPathArr.pop();
    resPathArr = resPathArr.filter(String);

    if (resPathArr.length) {
        return resPathArr.join('/');
    } else {
        return 'root';
    }
};

export const isValidResourceName = (name: unknown): name is string => {
    return typeof name === 'string' && RESOURCE_NAME_REGEX.test(name);
};

export const isSystemResourcePath = (resPath: string): boolean => {
    return getResourceSubPath(resPath) === 'system_resources';
};

export const getAllowedResourceRoots = (): string[] => {
    if (!txConfig.server.dataPath) return [];
    return [path.resolve(txConfig.server.dataPath, 'resources')];
};

export type ResourceDownloadPathValidation =
    | { ok: true; resourceRoot: string }
    | { ok: false; error: string; status: number };

/**
 * Validates that a resource directory is safe to zip (not system_resources, under allowed roots).
 */
export const validateResourceDownloadPath = (resPath: string): ResourceDownloadPathValidation => {
    if (!resPath || typeof resPath !== 'string') {
        return { ok: false, error: 'Invalid resource path.', status: 400 };
    }

    const normalizedPath = slash(path.normalize(resPath));
    if (isSystemResourcePath(normalizedPath)) {
        return { ok: false, error: 'Downloading system resources is not allowed.', status: 403 };
    }

    const resourceRoot = path.resolve(normalizedPath);
    const allowedRoots = getAllowedResourceRoots();
    if (!allowedRoots.length) {
        return { ok: false, error: 'Server data path not configured.', status: 400 };
    }

    const isUnderAllowedRoot = allowedRoots.some((root) => {
        return resourceRoot.startsWith(root + path.sep);
    });
    if (!isUnderAllowedRoot) {
        return { ok: false, error: 'Resource path is outside the allowed download directory.', status: 403 };
    }

    if (allowedRoots.some((root) => resourceRoot === root)) {
        return { ok: false, error: 'Cannot download the entire resources directory.', status: 403 };
    }

    return { ok: true, resourceRoot };
};

export type RawResourceReportEntry = {
    name?: string;
    status?: string;
    path?: string;
    version?: string;
    author?: string;
    description?: string;
};

export const findResourceByName = (
    resList: RawResourceReportEntry[],
    name: string,
): { name: string; path: string } | null => {
    for (const resource of resList) {
        if (
            isUndefined(resource.name) ||
            isUndefined(resource.path) ||
            resource.path === '' ||
            resource.name !== name
        ) {
            continue;
        }
        return {
            name: resource.name,
            path: slash(path.normalize(resource.path)),
        };
    }
    return null;
};

export function processResources(
    resList: RawResourceReportEntry[],
    updateNotices?: ReadonlyMap<string, string>,
): ResourcesListResp {
    const resGroupMap: Record<string, ResourceItemData[]> = {};
    let startedCount = 0;
    let stoppedCount = 0;

    for (const resource of resList) {
        if (
            isUndefined(resource.name) ||
            isUndefined(resource.status) ||
            isUndefined(resource.path) ||
            resource.path === ''
        ) {
            continue;
        }
        const subPath = getResourceSubPath(resource.path);
        const resData: ResourceItemData = {
            name: resource.name,
            status: resource.status,
            path: slash(path.normalize(resource.path)),
            version: resource.version ? resource.version.trim() : '',
            author: resource.author ? resource.author.trim() : '',
            description: resource.description ? resource.description.trim() : '',
            updateNotice: updateNotices?.get(resource.name),
        };

        if (resource.status === 'started') {
            startedCount++;
        } else {
            stoppedCount++;
        }

        if (resGroupMap[subPath]) {
            resGroupMap[subPath].push(resData);
        } else {
            resGroupMap[subPath] = [resData];
        }
    }

    const groups: ResourceGroup[] = Object.keys(resGroupMap)
        .sort()
        .map((subPath) => ({
            subPath,
            resources: resGroupMap[subPath].sort((a, b) => a.name.localeCompare(b.name)),
        }));

    return {
        groups,
        totalResources: startedCount + stoppedCount,
        startedCount,
        stoppedCount,
    };
}

export type FetchResourceReportResult =
    | { ok: true; resources: RawResourceReportEntry[] }
    | { ok: false; error: string };

export type ResolveResourceDownloadResult =
    | { ok: true; resourceRoot: string }
    | { ok: false; error: string; status: number };

const DEFAULT_REPORT_TIMEOUT_MS = 1000;
const REPORT_POLL_INTERVAL_MS = 100;
const REPORT_MAX_AGE_MS = 1000;
/** Cached report TTL for downloads — avoids a full FXServer round-trip on every click. */
export const DOWNLOAD_REPORT_MAX_AGE_MS = 5 * 60 * 1000;
let pendingFreshResourceReport: Promise<FetchResourceReportResult> | null = null;

const getResourceReportIfFresh = (maxAgeMs: number): RawResourceReportEntry[] | null => {
    const report = txCore.fxResources.resourceReport;
    if (report && new Date().getTime() - report.ts.getTime() <= maxAgeMs && Array.isArray(report.resources)) {
        return report.resources;
    }
    return null;
};

const isFreshResourceReport = (): RawResourceReportEntry[] | null => {
    return getResourceReportIfFresh(REPORT_MAX_AGE_MS);
};

/**
 * Returns a cached resource report when still fresh enough for download path lookup.
 */
export const getCachedResourceReport = (maxAgeMs = DOWNLOAD_REPORT_MAX_AGE_MS): RawResourceReportEntry[] | null => {
    return getResourceReportIfFresh(maxAgeMs);
};

/**
 * Validates a client-supplied resource path from the resources list (instant lookup).
 */
export const resolveResourceDownloadPathFromQuery = (
    resourceName: string,
    resourcePath: unknown,
): ResolveResourceDownloadResult | null => {
    if (!isValidResourceName(resourceName)) {
        return null;
    }
    if (typeof resourcePath !== 'string' || !resourcePath.trim()) {
        return null;
    }

    const pathValidation = validateResourceDownloadPath(resourcePath);
    if (!pathValidation.ok) {
        return null;
    }
    if (path.basename(pathValidation.resourceRoot) !== resourceName) {
        return null;
    }

    return pathValidation;
};

/**
 * Finds a resource folder on disk without asking FXServer.
 */
export const findResourceDownloadPathOnDisk = async (resourceName: string): Promise<string | null> => {
    const allowedRoots = getAllowedResourceRoots();
    if (!allowedRoots.length) {
        return null;
    }

    const resourcesRoot = allowedRoots[0]!;
    const directPath = path.join(resourcesRoot, resourceName);
    try {
        const stat = await fsp.stat(directPath);
        if (stat.isDirectory()) {
            const validation = validateResourceDownloadPath(directPath);
            if (validation.ok) {
                return validation.resourceRoot;
            }
        }
    } catch {
        // fall through to nested search
    }

    const globExclude = RESOURCE_ZIP_SKIP_DIRECTORY_NAMES.map((name) => `**/${name}/**`);
    for await (const entry of glob(`**/${resourceName}`, {
        cwd: resourcesRoot,
        withFileTypes: true,
        followSymlinks: false,
        exclude: globExclude,
    })) {
        if (typeof entry === 'string' || entry.isSymbolicLink() || !entry.isDirectory()) {
            continue;
        }

        const relativePath = getGlobEntryRelativePath(entry, resourcesRoot);
        if (!relativePath || hasSkippedZipPathSegment(relativePath)) {
            continue;
        }

        const candidate = path.resolve(resourcesRoot, relativePath);
        const validation = validateResourceDownloadPath(candidate);
        if (validation.ok) {
            return validation.resourceRoot;
        }
    }

    return null;
};

/**
 * Resolves a resource folder on disk for download.
 * Order: query path → cached FX report → disk scan → live FX report.
 */
export const resolveResourceDownloadPath = async (
    resourceName: string,
    resourcePath?: unknown,
): Promise<ResolveResourceDownloadResult> => {
    if (!isValidResourceName(resourceName)) {
        return { ok: false, error: 'Invalid resource name.', status: 400 };
    }

    const fromQuery = resolveResourceDownloadPathFromQuery(resourceName, resourcePath);
    if (fromQuery) {
        return fromQuery;
    }

    let resources = getCachedResourceReport();
    let resourceEntry = resources ? findResourceByName(resources, resourceName) : null;

    if (!resourceEntry) {
        const onDiskPath = await findResourceDownloadPathOnDisk(resourceName);
        if (onDiskPath) {
            return { ok: true, resourceRoot: onDiskPath };
        }
    }

    if (!resourceEntry) {
        const reportResult = await fetchFreshResourceReport();
        if (!reportResult.ok) {
            return { ok: false, error: reportResult.error, status: 503 };
        }
        resourceEntry = findResourceByName(reportResult.resources, resourceName);
    }

    if (!resourceEntry) {
        return { ok: false, error: 'Resource not found.', status: 404 };
    }

    const pathValidation = validateResourceDownloadPath(resourceEntry.path);
    if (!pathValidation.ok) {
        return { ok: false, error: pathValidation.error, status: pathValidation.status };
    }

    return { ok: true, resourceRoot: pathValidation.resourceRoot };
};

/**
 * Returns a fresh resource report from FXServer, polling after txaReportResources.
 */
export const fetchFreshResourceReport = async (
    timeoutMs = DEFAULT_REPORT_TIMEOUT_MS,
): Promise<FetchResourceReportResult> => {
    if (!txCore.fxRunner.child?.isAlive) {
        return { ok: false, error: 'The server is not running.' };
    }

    const freshCachedReport = isFreshResourceReport();
    if (freshCachedReport) {
        return { ok: true, resources: freshCachedReport };
    }

    if (pendingFreshResourceReport) {
        return pendingFreshResourceReport;
    }

    const cmdSuccess = txCore.fxRunner.sendCommand('txaReportResources', [], SYM_SYSTEM_AUTHOR);
    if (!cmdSuccess) {
        return { ok: false, error: 'Failed to request resource list from the server.' };
    }

    let pendingReport: Promise<FetchResourceReportResult>;
    pendingReport = new Promise<FetchResourceReportResult>((resolve) => {
        const finish = (result: FetchResourceReportResult) => {
            if (pendingFreshResourceReport === pendingReport) {
                pendingFreshResourceReport = null;
            }
            resolve(result);
        };

        const pollInterval = setInterval(() => {
            const resources = isFreshResourceReport();
            if (resources) {
                clearInterval(pollInterval);
                clearTimeout(timeout);
                finish({ ok: true, resources });
            }
        }, REPORT_POLL_INTERVAL_MS);

        const timeout = setTimeout(() => {
            clearInterval(pollInterval);
            finish({
                ok: false,
                error: 'Timed out waiting for resource list. Make sure the server is online.',
            });
        }, timeoutMs);
    });
    pendingFreshResourceReport = pendingReport;

    return pendingReport;
};
