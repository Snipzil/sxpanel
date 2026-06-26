#!/usr/bin/env node
/**
 * CI guard: built panel CSS must not contain color-mix() after cefCssCompat runs.
 * FiveM CEF ~Chrome 103 skips @supports(color:color-mix(...)) and would render
 * Tailwind v4 opacity utilities at full opacity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panelOutDir = path.resolve(__dirname, '../../monitor/panel');

if (!fs.existsSync(panelOutDir)) {
    console.error(`[verify-cef-css] missing output dir: ${panelOutDir}`);
    console.error('Run: npm run build -w panel');
    process.exit(1);
}

const cssFiles = fs.readdirSync(panelOutDir).filter((name) => name.endsWith('.css'));
let totalColorMix = 0;
const offenders = [];

for (const file of cssFiles) {
    const content = fs.readFileSync(path.join(panelOutDir, file), 'utf8');
    const count = (content.match(/color-mix\(/g) ?? []).length;
    totalColorMix += count;
    if (count > 0) offenders.push({ file, count });
}

if (offenders.length > 0) {
    console.error('[verify-cef-css] color-mix() found in built panel CSS:');
    for (const { file, count } of offenders) {
        console.error(`  ${file}: ${count}`);
    }
    process.exit(1);
}

console.log(`[verify-cef-css] OK — ${cssFiles.length} CSS file(s), color-mix count = ${totalColorMix}`);
