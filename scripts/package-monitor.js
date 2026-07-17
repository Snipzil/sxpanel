import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';

const monitorDir = path.resolve('monitor');
const zipPath = path.resolve('monitor.zip');
const shaPath = path.resolve('monitor.zip.sha256');

if (!existsSync(monitorDir)) {
    console.error(`Monitor directory not found: ${monitorDir}`);
    process.exit(1);
}

if (platform() === 'win32') {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${monitorDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'inherit' });
} else {
    execSync(`zip -r ${zipPath} .`, { cwd: monitorDir, stdio: 'inherit' });
}

const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
writeFileSync(shaPath, `${digest}  monitor.zip\n`);
console.log(`Packaged ${zipPath} and ${shaPath}`);
