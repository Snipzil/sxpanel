import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { finished } from 'node:stream/promises';

import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { spawnNativeResourceZip } from './nativeResourceZip';

describe('spawnNativeResourceZip', () => {
    let tempDir = '';

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });

            tempDir = '';
        }
    });

    it('streams a zip archive from disk', async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'fxp-native-zip-'));

        await writeFile(join(tempDir, 'fxmanifest.lua'), "fx_version 'cerulean'", 'utf8');

        await mkdir(join(tempDir, 'stream'));

        await writeFile(join(tempDir, 'stream', 'model.ydr'), 'binary', 'utf8');

        const zip = spawnNativeResourceZip(tempDir);

        const chunks: Buffer[] = [];

        const sink = new Writable({
            write(chunk, _encoding, callback) {
                chunks.push(Buffer.from(chunk));

                callback();
            },
        });

        zip.stdout.pipe(sink);

        const [result] = await Promise.all([zip.done, finished(sink)]);

        expect(result).toEqual({ ok: true });

        expect(Buffer.concat(chunks).length).toBeGreaterThan(0);
    });
});
