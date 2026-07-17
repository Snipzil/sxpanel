import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import StreamZip from 'node-stream-zip';

const monitorDir = path.resolve('monitor');
const zipPath = path.resolve('monitor.zip');
const shaPath = path.resolve('monitor.zip.sha256');

//Entries that must exist for the resource to boot at all
const requiredEntries = ['fxmanifest.lua', 'entrypoint.js', 'core/index.js', 'resource/sv_main.lua'];

if (!existsSync(monitorDir)) {
    console.error(`Monitor directory not found: ${monitorDir}`);
    process.exit(1);
}

//NOTE: do not replace this with PowerShell's Compress-Archive — it writes
//backslash entry paths, which Linux unzip extracts as flat literal filenames
await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.on('warning', reject);
    archive.pipe(output);
    archive.directory(monitorDir, false);
    archive.finalize();
});

//Make sure the zip extracts correctly on every platform
const zip = new StreamZip.async({ file: zipPath });
const entryNames = Object.keys(await zip.entries());
await zip.close();

const badEntries = entryNames.filter((name) => name.includes('\\'));
if (badEntries.length) {
    console.error(`Zip has ${badEntries.length} entries with backslash paths (eg. '${badEntries[0]}'), aborting.`);
    process.exit(1);
}
const missingEntries = requiredEntries.filter((name) => !entryNames.includes(name));
if (missingEntries.length) {
    console.error(`Zip is missing required entries: ${missingEntries.join(', ')}`);
    process.exit(1);
}

const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
writeFileSync(shaPath, `${digest}  monitor.zip\n`);
console.log(`Packaged ${zipPath} (${entryNames.length} entries) and ${shaPath}`);
