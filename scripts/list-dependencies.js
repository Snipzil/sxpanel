import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

//Get target folder path
const targetPath = process.argv[2];
if (typeof targetPath !== 'string' || !targetPath.length) {
    console.log('Usage: node scripts/list-dependencies.js <package-folder>');
    process.exit(1);
}
const targetFolderName = path.basename(targetPath);
const targetPathResolved = path.resolve(process.cwd(), targetFolderName);
if (!fs.existsSync(targetPathResolved) || !fs.statSync(targetPathResolved).isDirectory()) {
    console.log(chalk.red(`[ERROR] Invalid package folder: ${targetPath}`));
    process.exit(1);
}
const cwdRealPath = fs.realpathSync(process.cwd());
const targetRealPath = fs.realpathSync(targetPathResolved);
const targetWithinWorkspace = targetRealPath === cwdRealPath || targetRealPath.startsWith(cwdRealPath + path.sep);
if (!targetWithinWorkspace) {
    console.log(chalk.red(`[ERROR] Target folder must be within the current workspace.`));
    process.exit(1);
}
console.log('Scanning for dependencies in:', chalk.blue(targetRealPath));

//Get list of all dependencies from both the target and root package.json
const readDeps = (pkgPath) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
    } catch {
        return [];
    }
};
const dependencies = new Set([...readDeps(path.join(targetRealPath, 'package.json')), ...readDeps('./package.json')]);

//NOTE: To generate this list, use `node -pe "require('repl')._builtinLibs"` in both node16 and 22, then merge them.
const builtInModules = [
    'assert',
    'assert/strict',
    'async_hooks',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'diagnostics_channel',
    'dns',
    'dns/promises',
    'domain',
    'events',
    'fs',
    'fs/promises',
    'http',
    'http2',
    'https',
    'inspector',
    'inspector/promises',
    'module',
    'net',
    'os',
    'path',
    'path/posix',
    'path/win32',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'readline/promises',
    'repl',
    'stream',
    'stream/consumers',
    'stream/promises',
    'stream/web',
    'string_decoder',
    'sys',
    'test/reporters',
    'timers',
    'timers/promises',
    'tls',
    'trace_events',
    'tty',
    'url',
    'util',
    'util/types',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
];

//Track errors and local imports for circular detection
let errorCount = 0;
const allDependencies = new Set();
// Maps absolute file path -> list of absolute file paths it imports locally
const localImportGraph = new Map();

const ignoredPrefixes = [
    'node:',
    '/',
    '@shared',
    '@utils',
    '@lib',
    '@logic',
    '@modules',
    '@routes',
    '@core',
    '@locale/',
    '@nui/',
    '@/',
];
const validExtensions = ['.cjs', '.js', '.ts', '.jsx', '.tsx'];
const importRegex = /^(?!\s*\/\/)\s*import\s+.+?\s+from\s+['"]([^'"]+)['"]/gm;
const requireRegex = /^(?!\s*\/\/).*?\b(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

//Resolve a relative import specifier to an absolute file path
const resolveLocalImport = (fromFile, specifier) => {
    const dir = path.dirname(fromFile);
    const resolved = path.resolve(dir, specifier);

    //Try exact match first, then with extensions
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    for (const ext of validExtensions) {
        const withExt = resolved + ext;
        if (fs.existsSync(withExt)) return withExt;
    }
    //Try index files in directory
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        for (const ext of validExtensions) {
            const indexFile = path.join(resolved, 'index' + ext);
            if (fs.existsSync(indexFile)) return indexFile;
        }
    }
    return null;
};

//Process file and extract all dependencies
const processFile = (filePath) => {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const importMatches = [...fileContent.matchAll(importRegex)].map((m) => m[1]);
    const requireMatches = [...fileContent.matchAll(requireRegex)].map((m) => m[1]);
    const allMatches = [...importMatches, ...requireMatches];
    const localImports = [];

    for (const importedModule of allMatches) {
        //Handle relative imports for circular detection
        if (importedModule.startsWith('./') || importedModule.startsWith('../') || importedModule === '.') {
            const resolved = resolveLocalImport(filePath, importedModule);
            if (resolved) localImports.push(resolved);
            continue;
        }

        if (ignoredPrefixes.some((prefix) => importedModule.startsWith(prefix))) continue;
        if (!importedModule || importedModule.includes('${')) continue;
        if (builtInModules.includes(importedModule)) {
            console.log(chalk.red(`[ERROR] builtin module '${importedModule}' without 'node:' from: ${filePath}`));
            errorCount++;
            continue;
        }

        const pkgName = importedModule.startsWith('@')
            ? importedModule.split('/').slice(0, 2).join('/')
            : importedModule.split('/')[0];
        if (!dependencies.has(pkgName)) {
            console.log(
                chalk.yellow(`[WARN] imported module '${importedModule}' not found in package.json from: ${filePath}`),
            );
            errorCount++;
            continue;
        }
        allDependencies.add(pkgName);
    }

    if (localImports.length) {
        localImportGraph.set(filePath, localImports);
    }
};

//Recursively read all files in the targetPath and its subfolders
const processFolder = (dirPath) => {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const file of files) {
        const currFilePath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            if (file.name === 'node_modules') continue;
            processFolder(currFilePath);
        } else if (!file.isFile()) {
            console.log(chalk.red(`[ERROR] Invalid file: ${currFilePath}`));
            errorCount++;
        } else if (validExtensions.includes(path.extname(currFilePath))) {
            processFile(currFilePath);
        }
    }
};
processFolder(targetRealPath);

//Detect circular imports via DFS
const detectCircularImports = () => {
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color = new Map();
    const cycles = [];

    const dfs = (node, stack) => {
        color.set(node, GRAY);
        stack.push(node);

        const neighbors = localImportGraph.get(node) ?? [];
        for (const neighbor of neighbors) {
            const c = color.get(neighbor) ?? WHITE;
            if (c === GRAY) {
                //Found a cycle — extract the cycle portion from the stack
                const cycleStart = stack.indexOf(neighbor);
                cycles.push(stack.slice(cycleStart));
            } else if (c === WHITE) {
                dfs(neighbor, stack);
            }
        }

        stack.pop();
        color.set(node, BLACK);
    };

    for (const node of localImportGraph.keys()) {
        if ((color.get(node) ?? WHITE) === WHITE) {
            dfs(node, []);
        }
    }

    return cycles;
};

const cycles = detectCircularImports();
if (cycles.length) {
    console.log(chalk.red(`\n[ERROR] Found ${cycles.length} circular import(s):`));
    for (const cycle of cycles) {
        const relativeCycle = cycle.map((f) => path.relative('.', f));
        console.log(chalk.red(`  ${relativeCycle.join(' -> ')} -> ${relativeCycle[0]}`));
    }
    errorCount += cycles.length;
}

//Summary
console.log(chalk.cyan('\nDependencies used:'));
for (const dep of [...allDependencies].sort()) {
    console.log(`  ${dep}`);
}

if (errorCount > 0) {
    console.log(chalk.red(`\n${errorCount} error(s) found.`));
    process.exit(1);
} else {
    console.log(chalk.green('\nNo errors found.'));
}
