import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { finished } from 'node:stream/promises';

import { Writable } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { isNativeZipCapable, spawnNativeResourceZip } from './nativeResourceZip';

describe('isNativeZipCapable', () => {
    it('detects whether the system tar can write zip format', async () => {
        // Just needs to resolve without throwing; true/false depends on the host's tar.
        const capable = await isNativeZipCapable();

        expect(typeof capable).toBe('boolean');
    });
});

describe('spawnNativeResourceZip', () => {
    let tempDir = '';

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });

            tempDir = '';
        }
    });

    it('streams a real zip archive (PK signature) when the host tar supports it', async () => {
        tempDir = await mkdtemp(join(tmpdir(), 'fxp-native-zip-'));

        await writeFile(join(tempDir, 'fxmanifest.lua'), "fx_version 'cerulean'", 'utf8');

        await mkdir(join(tempDir, 'stream'));

        await writeFile(join(tempDir, 'stream', 'model.ydr'), 'binary', 'utf8');

        const capable = await isNativeZipCapable();

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

        if (!capable) {
            // GNU tar rejects --format=zip outright; callers must gate on isNativeZipCapable() first.
            expect(result.ok).toBe(false);

            return;
        }

        expect(result).toEqual({ ok: true });

        const output = Buffer.concat(chunks);

        expect(output.length).toBeGreaterThan(0);
        // Real zip signature (PK\x03\x04) — guards against silently emitting a mislabeled tar stream.
        expect(output.subarray(0, 4).toString('hex')).toBe('504b0304');
    });
});
