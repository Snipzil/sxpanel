import fs from 'fs';

function countLeaves(obj) {
    let n = 0;
    for (const [k, v] of Object.entries(obj)) {
        if (k === '$meta') continue;
        if (v && typeof v === 'object' && !Array.isArray(v)) n += countLeaves(v);
        else if (typeof v === 'string') n++;
    }
    return n;
}

const path = new URL('../locale/en.json', import.meta.url);
const en = JSON.parse(fs.readFileSync(path, 'utf8'));
console.log('leaf_strings', countLeaves(en));
