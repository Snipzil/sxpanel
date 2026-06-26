import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { finished } from 'node:stream/promises';

import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { createResourceZipArchive } from './resourceDownloadCore';

import { zipResourceDir } from './zipResourceDir';

describe('zipResourceDir', () => {
    let tempDir = '';

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });

            tempDir = '';
        }
    });

    it('zips files while skipping ignored directories', async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'fxp-zip-test-'));

        await writeFile(join(tempDir, 'fxmanifest.lua'), "fx_version 'cerulean'", 'utf8');

        await mkdir(join(tempDir, 'stream'));

        await writeFile(join(tempDir, 'stream', 'model.ydr'), 'binary', 'utf8');

        await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true });

        await writeFile(join(tempDir, 'node_modules', 'pkg', 'index.js'), 'skip me', 'utf8');

        const archive = createResourceZipArchive();

        const sink = new Writable({
            write(_chunk, _encoding, callback) {
                callback();
            },
        });

        archive.pipe(sink);

        const result = await zipResourceDir(archive, tempDir);

        expect(result).toEqual({ ok: true });

        await archive.finalize();

        await finished(sink);
    });

    it('returns 404 for an empty directory', async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'fxp-zip-empty-'));

        const archive = createResourceZipArchive();

        const result = await zipResourceDir(archive, tempDir);

        expect(result).toEqual({ ok: false, error: 'Resource directory is empty.', status: 404 });
    });
});
