import { glob } from 'node:fs/promises';

import path from 'node:path';

import slash from 'slash';

import archiver from 'archiver';

import { MAX_RESOURCE_ZIP_FILES, RESOURCE_ZIP_SKIP_DIRECTORY_NAMES } from './shared';

type ArchiverInstance = ReturnType<typeof archiver>;

export type ZipResourceDirResult = { ok: true } | { ok: false; error: string; status: number };

const RESOURCE_ZIP_SKIP_DIRECTORY_SET = new Set<string>(RESOURCE_ZIP_SKIP_DIRECTORY_NAMES);

const GLOB_EXCLUDE_PATTERNS = RESOURCE_ZIP_SKIP_DIRECTORY_NAMES.map((name) => `**/${name}/**`);

const hasSkippedPathSegment = (relativePath: string): boolean => {
    const segments = slash(relativePath).split('/');

    return segments.some((segment) => RESOURCE_ZIP_SKIP_DIRECTORY_SET.has(segment));
};

const getGlobEntryRelativePath = (
    entry: { name: string; parentPath?: string; path?: string },

    cwd: string,
): string => {
    const parentPath =
        typeof entry.parentPath === 'string' ? entry.parentPath : typeof entry.path === 'string' ? entry.path : '';

    const combined = slash(parentPath ? path.join(parentPath, entry.name) : entry.name);

    if (path.isAbsolute(combined)) {
        return slash(path.relative(cwd, combined));
    }

    return combined;
};

/**

 * Queues resource files into archiver (fallback when native tar is unavailable).

 */

export const zipResourceDir = async (
    archive: ArchiverInstance,

    resourceRoot: string,
): Promise<ZipResourceDirResult> => {
    const resourceRootResolved = path.resolve(resourceRoot);

    let fileCount = 0;

    try {
        for await (const entry of glob('**/*', {
            cwd: resourceRootResolved,

            withFileTypes: true,

            followSymlinks: false,

            exclude: GLOB_EXCLUDE_PATTERNS,
        })) {
            if (typeof entry !== 'string' && entry.isSymbolicLink()) {
                continue;
            }

            const relativePath = getGlobEntryRelativePath(entry, resourceRootResolved);

            if (!relativePath || hasSkippedPathSegment(relativePath)) {
                continue;
            }

            if (typeof entry !== 'string' && !entry.isFile()) {
                continue;
            }

            if (fileCount >= MAX_RESOURCE_ZIP_FILES) {
                return {
                    ok: false,

                    error: `Resource exceeds the maximum of ${MAX_RESOURCE_ZIP_FILES} files.`,

                    status: 413,
                };
            }

            const absolutePath = path.join(resourceRootResolved, relativePath);

            archive.file(absolutePath, { name: relativePath });

            fileCount++;
        }
    } catch {
        return { ok: false, error: 'Resource directory not found or unreadable.', status: 404 };
    }

    if (!fileCount) {
        return { ok: false, error: 'Resource directory is empty.', status: 404 };
    }

    return { ok: true };
};
