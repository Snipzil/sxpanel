import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformCssForCef, dedupeFallbackOpacityRules } from '../vite-plugins/cefCssCompat.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(__dirname, '../../monitor/panel/index-m99istz2.v800.css');
const css = fs.readFileSync(cssPath, 'utf8');

const checks = [
    'display:flex',
    '.flex\\{',
    '.flex{',
    'justify-between',
    'max-width',
    '@layer properties',
    '--tw-translate-x',
    '.tx-shell',
    'grid-template',
];

console.log('Built CSS length:', css.length);
for (const pat of checks) {
    console.log(pat, css.includes(pat.replace(/\\{/g, '{')));
}

// Simulate removing only dedupe step - we need raw CSS; re-run partial transforms
// Count rules removed by dedupe on current file (already transformed)
const RULE_RE = /\.[^{}]+\{[^}]+\}/g;
const before = css.match(RULE_RE)?.length ?? 0;

// Check for obvious corruption: unmatched braces
let depth = 0;
for (const ch of css) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;
}
console.log('brace depth end:', depth);

// Find rules that look truncated (opened but weird)
const badFragments = css.match(/\.[^{]+\{[^}]{0,5}$/g);
console.log('truncated tail fragments:', badFragments?.length ?? 0);
