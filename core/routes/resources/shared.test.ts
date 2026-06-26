import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    findResourceByName,
    findResourceDownloadPathOnDisk,
    getCachedResourceReport,
    getResourceSubPath,
    isSystemResourcePath,
    isValidResourceName,
    resolveResourceDownloadPath,
    resolveResourceDownloadPathFromQuery,
    validateResourceDownloadPath,
} from './shared';

describe('resource shared helpers', () => {
    beforeEach(() => {
        vi.stubGlobal('txConfig', {
            server: {
                dataPath: path.join('C:', 'fxserver', 'server-data'),
            },
        });
        vi.stubGlobal('txCore', {
            fxResources: {
                resourceReport: undefined,
            },
            fxRunner: {
                child: { isAlive: true },
                sendCommand: vi.fn(() => true),
            },
        });
    });

    describe('isValidResourceName', () => {
        it('accepts valid FiveM-style names', () => {
            expect(isValidResourceName('es_extended')).toBe(true);
            expect(isValidResourceName('my-resource_v2')).toBe(true);
        });

        it('rejects traversal and invalid characters', () => {
            expect(isValidResourceName('../etc')).toBe(false);
            expect(isValidResourceName('')).toBe(false);
            expect(isValidResourceName('a/b')).toBe(false);
            expect(isValidResourceName(null)).toBe(false);
        });
    });

    describe('findResourceByName', () => {
        it('returns matching resource path', () => {
            const result = findResourceByName(
                [
                    { name: 'other', path: '/x/other' },
                    { name: 'target', path: '/x/target' },
                ],
                'target',
            );
            expect(result).toEqual({ name: 'target', path: '/x/target' });
        });

        it('returns null when not found', () => {
            expect(findResourceByName([{ name: 'a', path: '/a' }], 'missing')).toBeNull();
        });
    });

    describe('getResourceSubPath / system resources', () => {
        it('classifies system_resources paths', () => {
            const p = path.join('C:', 'citizen', 'system_resources', 'monitor');
            expect(getResourceSubPath(p)).toBe('system_resources');
            expect(isSystemResourcePath(p)).toBe(true);
        });
    });

    describe('validateResourceDownloadPath', () => {
        it('allows paths under server data resources', () => {
            const resPath = path.join('C:', 'fxserver', 'server-data', 'resources', '[esx]', 'es_extended');
            const result = validateResourceDownloadPath(resPath);
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.resourceRoot).toBe(path.resolve(resPath));
            }
        });

        it('blocks system_resources', () => {
            const resPath = path.join('C:', 'citizen', 'system_resources', 'monitor');
            const result = validateResourceDownloadPath(resPath);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(403);
            }
        });

        it('blocks paths outside allowed roots', () => {
            const result = validateResourceDownloadPath(path.join('C:', 'other', 'secret'));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(403);
            }
        });

        it('blocks downloading the entire resources directory', () => {
            const result = validateResourceDownloadPath(path.join('C:', 'fxserver', 'server-data', 'resources'));
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.status).toBe(403);
            }
        });
    });

    describe('resolveResourceDownloadPathFromQuery', () => {
        it('accepts a validated path when the folder name matches', () => {
            const resPath = path.join('C:', 'fxserver', 'server-data', 'resources', '[esx]', 'es_extended');
            const result = resolveResourceDownloadPathFromQuery('es_extended', resPath);
            expect(result).toEqual({
                ok: true,
                resourceRoot: path.resolve(resPath),
            });
        });

        it('rejects a path whose folder name does not match the resource name', () => {
            const resPath = path.join('C:', 'fxserver', 'server-data', 'resources', '[esx]', 'es_extended');
            expect(resolveResourceDownloadPathFromQuery('other_resource', resPath)).toBeNull();
        });
    });

    describe('findResourceDownloadPathOnDisk', () => {
        let tempResourcesRoot = '';

        let serverDataPath = '';

        afterEach(async () => {
            if (serverDataPath) {
                await rm(serverDataPath, { recursive: true, force: true });
                serverDataPath = '';
                tempResourcesRoot = '';
            }
        });

        it('finds a nested resource folder by name', async () => {
            serverDataPath = await mkdtemp(path.join(tmpdir(), 'fxp-server-'));
            tempResourcesRoot = path.join(serverDataPath, 'resources');
            const nestedPath = path.join(tempResourcesRoot, '[esx]', 'es_extended');
            await mkdir(nestedPath, { recursive: true });

            txConfig.server.dataPath = serverDataPath;

            const result = await findResourceDownloadPathOnDisk('es_extended');
            expect(result).toBe(path.resolve(nestedPath));
        });
    });

    describe('getCachedResourceReport / resolveResourceDownloadPath', () => {
        it('returns cached report within download TTL', () => {
            const resources = [{ name: 'es_extended', path: '/x/es_extended' }];
            txCore.fxResources.resourceReport = {
                ts: new Date(),
                resources,
            };
            expect(getCachedResourceReport()).toEqual(resources);
        });

        it('resolveResourceDownloadPath uses cache without calling FXServer', async () => {
            const resPath = path.join('C:', 'fxserver', 'server-data', 'resources', '[esx]', 'es_extended');
            txCore.fxResources.resourceReport = {
                ts: new Date(),
                resources: [{ name: 'es_extended', path: resPath }],
            };

            const result = await resolveResourceDownloadPath('es_extended');
            expect(result.ok).toBe(true);
            if (result.ok) {
                expect(result.resourceRoot).toBe(path.resolve(resPath));
            }
            expect(txCore.fxRunner.sendCommand).not.toHaveBeenCalled();
        });
    });
});
