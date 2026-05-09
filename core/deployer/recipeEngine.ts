const modulename = 'RecipeEngine';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';
import { pipeline } from 'node:stream/promises';
import StreamZip from 'node-stream-zip';
import { escapeRegExp } from 'lodash-es';
import mysql from 'mysql2/promise';
import got from 'got';
import consoleFactory from '@lib/console';
import { outputFile, movePath } from '@lib/fs';
import type { RecipeTask, DeployerContext, RecipeEngineMap } from './recipeTypes';
const console = consoleFactory(modulename);

//=============================================================
//== SSRF guard
//=============================================================
/**
 * Returns true if the IPv4 address is globally routable (not loopback,
 * private, link-local, CGNAT, multicast, reserved, or cloud-metadata).
 */
const isPublicIPv4 = (ip: string): boolean => {
    const parts = ip.split('.').map((o) => Number(o));
    if (parts.length !== 4 || parts.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
    const [a, b, c] = parts;
    if (a === 0) return false; // 0.0.0.0/8
    if (a === 10) return false; // 10/8 private
    if (a === 127) return false; // loopback
    if (a === 169 && b === 254) return false; // link-local + 169.254.169.254 metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12 private
    if (a === 192 && b === 168) return false; // 192.168/16 private
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64/10
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // reserved / TEST-NET-1
    if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmark
    if (a >= 224) return false; // multicast (224/4) + reserved + broadcast
    return true;
};

/**
 * Returns true if the IPv6 address is globally routable (not loopback,
 * link-local, unique-local, multicast, or IPv4-mapped-private).
 */
const isPublicIPv6 = (ipRaw: string): boolean => {
    const ip = ipRaw.toLowerCase();
    if (ip === '::' || ip === '::1') return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPublicIPv4(mapped[1]);
    if (/^fe[89ab]/.test(ip)) return false; // fe80::/10 link-local
    if (/^f[cd]/.test(ip)) return false; // fc00::/7 unique-local
    if (/^ff/.test(ip)) return false; // ff00::/8 multicast
    if (ip.startsWith('2001:db8:')) return false; // documentation
    if (/^2001:(0{1,4}:)/.test(ip)) return false; // 2001:0::/32 Teredo
    return true;
};

const isPublicIp = (ip: string): boolean => {
    const fam = net.isIP(ip);
    if (fam === 4) return isPublicIPv4(ip);
    if (fam === 6) return isPublicIPv6(ip);
    return false;
};

/**
 * Rejects URLs that would produce SSRF: non-http(s) schemes, or hostnames that
 * resolve to loopback / RFC1918 / link-local / CGNAT / multicast / cloud-metadata.
 * Resolves ALL DNS answers and rejects if any are non-public (defeats a first-answer
 * DNS-rebind attempt on the initial lookup).
 */
const assertPublicUrl = async (urlStr: string): Promise<void> => {
    let parsed: URL;
    try {
        parsed = new URL(urlStr);
    } catch {
        throw new Error('invalid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`unsupported URL scheme: ${parsed.protocol}`);
    }
    const host = parsed.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
    if (net.isIP(host)) {
        if (!isPublicIp(host)) throw new Error(`URL points to non-public address: ${host}`);
        return;
    }
    const results = await dns.lookup(host, { all: true, verbatim: true });
    if (!results.length) throw new Error(`DNS resolution failed for ${host}`);
    for (const r of results) {
        if (!isPublicIp(r.address)) {
            throw new Error(`URL resolves to non-public address: ${host} -> ${r.address}`);
        }
    }
};

//=============================================================
//== Path helper functions
//=============================================================
const safePath = (base: string, suffix: string) => {
    const safeSuffix = path.normalize(suffix).replace(/^(\.\.(\/|\\|$))+/, '');
    const resolved = path.resolve(base, safeSuffix);
    const normalizedBase = path.resolve(base);
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
        throw new Error(`Path traversal blocked: "${suffix}" escapes base directory`);
    }
    return resolved;
};

/**
 * ZIP-slip guard. Validates every entry in the archive resolves inside `destRoot`
 * before delegating extraction. node-stream-zip's `extract` does NOT validate
 * entry names against traversal — a malicious recipe-controlled archive could
 * otherwise write to `..\\..\\windows\\system32\\...` or an absolute path.
 *
 * We reject:
 *   - absolute paths (Unix "/x" or Windows "C:\\x")
 *   - null bytes (can truncate paths in downstream consumers)
 *   - any entry whose resolved path is outside destRoot (including exact equality,
 *     so "." can't clobber the root dir itself)
 *   - any entry under a zipPrefix restriction when one is supplied
 */
const assertZipEntriesSafe = (
    entries: { name: string; isDirectory: boolean }[],
    destRoot: string,
    zipPrefix?: string,
) => {
    const normalizedRoot = path.resolve(destRoot);
    const prefix = zipPrefix ? zipPrefix.replace(/\\/g, '/').replace(/\/+$/, '') + '/' : '';
    for (const entry of entries) {
        const name = entry.name;
        if (name.includes('\0')) throw new Error(`zip entry has null byte: ${name}`);
        if (path.isAbsolute(name) || /^[a-zA-Z]:[/\\]/.test(name)) {
            throw new Error(`zip entry has absolute path: ${name}`);
        }
        //Only validate entries under the requested prefix — others are ignored
        //by the downstream extract() call anyway.
        const normalizedName = name.replace(/\\/g, '/');
        if (prefix && !normalizedName.startsWith(prefix)) continue;
        const relative = prefix ? normalizedName.slice(prefix.length) : normalizedName;
        if (!relative) continue;
        const resolved = path.resolve(normalizedRoot, relative);
        if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
            throw new Error(`zip entry escapes extract root: ${name}`);
        }
    }
};

const isPathLinear = (pathInput: string) => {
    return pathInput.match(/(\.\.(\/|\\|$))+/g) === null;
};

const isPathRoot = (pathInput: string) => {
    return /^\.[/\\]*$/.test(pathInput);
};

const pathCleanTrail = (pathInput: string) => {
    return pathInput.replace(/[/\\]+$/, '');
};

const isPathValid = (pathInput: unknown, acceptRoot = true): pathInput is string => {
    return (
        typeof pathInput === 'string' &&
        pathInput.length > 0 &&
        isPathLinear(pathInput) &&
        (acceptRoot || !isPathRoot(pathInput))
    );
};

const replaceVars = (inputString: string, ctx: DeployerContext) => {
    const keys = Object.keys(ctx).filter((k) => k !== 'dbConnection' && k !== '$step');
    if (!keys.length) return inputString;
    const pattern = new RegExp(keys.map((k) => escapeRegExp(`{{${k}}}`)).join('|'), 'g');
    return inputString.replace(pattern, (match) => {
        const varName = match.slice(2, -2);
        return String(ctx[varName]);
    });
};

//=============================================================
//== download_file
//=============================================================
const validatorDownloadFile = (task: RecipeTask) => {
    return typeof task.url === 'string' && isPathValid(task.path);
};

const taskDownloadFile = async (task: RecipeTask, basePath: string, ctx: DeployerContext) => {
    if (!validatorDownloadFile(task)) throw new Error('invalid options');
    if ((task.path as string).endsWith('/')) throw new Error('target filename not specified');

    const destPath = safePath(basePath, task.path as string);
    await outputFile(destPath, 'file save attempt, please ignore or remove');

    ctx.$step = 'before stream';
    await assertPublicUrl(task.url as string);
    const gotOptions = {
        timeout: { request: 150e3 },
        retry: { limit: 5 },
    };
    const gotStream = got.stream(task.url as string, gotOptions);
    gotStream.on('downloadProgress', (progress) => {
        ctx.$step = `downloading ${Math.round(progress.percent * 100)}%`;
    });
    await pipeline(gotStream as any, fs.createWriteStream(destPath) as any);
    ctx.$step = 'after stream';
};

//=============================================================
//== download_github
//=============================================================
const githubRepoSourceRegex = /^((https?:\/\/github\.com\/)?|@)?([\w.\-_]+)\/([\w.\-_]+).*$/;

const validatorDownloadGithub = (task: RecipeTask) => {
    return (
        typeof task.src === 'string' &&
        isPathValid(task.dest, false) &&
        (typeof task.ref === 'string' || typeof task.ref === 'undefined') &&
        (typeof task.subpath === 'string' || typeof task.subpath === 'undefined')
    );
};

const taskDownloadGithub = async (task: RecipeTask, basePath: string, ctx: DeployerContext) => {
    if (!validatorDownloadGithub(task)) throw new Error('invalid options');

    //Parse source
    ctx.$step = 'task start';
    const srcMatch = (task.src as string).match(githubRepoSourceRegex);
    if (!srcMatch || !srcMatch[3] || !srcMatch[4]) throw new Error('invalid repository');
    const repoOwner = srcMatch[3];
    const repoName = srcMatch[4];

    //Resolve git ref
    let reference: string;
    const githubHeaders: Record<string, string> = {};
    if (ctx.$githubToken) {
        githubHeaders['Authorization'] = `Bearer ${ctx.$githubToken}`;
    }
    if (task.ref) {
        reference = task.ref as string;
    } else {
        const refLookupUrl = `https://api.github.com/repos/${repoOwner}/${repoName}`;
        await assertPublicUrl(refLookupUrl);
        const data = await got
            .get(refLookupUrl, {
                timeout: { request: 15e3 },
                headers: githubHeaders,
            })
            .json<{ default_branch?: string }>();
        if (typeof data !== 'object' || !data.default_branch) {
            throw new Error("reference not set, and was not able to detect using github's api");
        }
        reference = data.default_branch;
    }
    ctx.$step = 'ref set';

    //Prepare paths
    const downURL = `https://api.github.com/repos/${repoOwner}/${repoName}/zipball/${reference}`;
    const tmpFilePath = path.join(basePath, `.${(Date.now() % 100000000).toString(36)}.download`);
    const destPath = safePath(basePath, task.dest as string);

    //Download
    ctx.$step = 'before stream';
    await assertPublicUrl(downURL);
    const gotOptions = {
        timeout: { request: 150e3 },
        retry: { limit: 5 },
        headers: githubHeaders,
    };
    const gotStream = got.stream(downURL, gotOptions);
    gotStream.on('downloadProgress', (progress) => {
        ctx.$step = `downloading ${Math.round(progress.percent * 100)}%`;
    });
    await pipeline(gotStream as any, fs.createWriteStream(tmpFilePath) as any);
    ctx.$step = 'after stream';

    //Extract
    const zip = new StreamZip.async({ file: tmpFilePath });
    try {
        const entries = Object.values(await zip.entries());
        if (!entries.length || !entries[0].isDirectory) throw new Error('unexpected zip structure');
        const zipSubPath = path.posix.join(entries[0].name, (task.subpath as string) || '');
        ctx.$step = 'zip parsed';
        await fsp.mkdir(destPath, { recursive: true });
        ctx.$step = 'dest path created';
        assertZipEntriesSafe(entries, destPath, zipSubPath);
        await zip.extract(zipSubPath, destPath);
        ctx.$step = 'zip extracted';
    } finally {
        try {
            await zip.close();
            ctx.$step = 'zip closed';
        } catch {
            // Ignore zip close errors so temp-file cleanup always runs
        }
        try {
            await fsp.rm(tmpFilePath, { recursive: true, force: true });
            ctx.$step = 'task finished';
        } catch {
            // Ignore temp-file removal errors
        }
    }
};

//=============================================================
//== remove_path
//=============================================================
const validatorRemovePath = (task: RecipeTask) => {
    return isPathValid(task.path, false);
};

const taskRemovePath = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorRemovePath(task)) throw new Error('invalid options');

    const targetPath = safePath(basePath, task.path as string);
    const cleanBasePath = pathCleanTrail(path.normalize(basePath));
    if (cleanBasePath === targetPath) throw new Error('cannot remove base folder');
    await fsp.rm(targetPath, { recursive: true, force: true });
};

//=============================================================
//== ensure_dir
//=============================================================
const validatorEnsureDir = (task: RecipeTask) => {
    return isPathValid(task.path, false);
};

const taskEnsureDir = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorEnsureDir(task)) throw new Error('invalid options');

    const destPath = safePath(basePath, task.path as string);
    await fsp.mkdir(destPath, { recursive: true });
};

//=============================================================
//== unzip
//=============================================================
const validatorUnzip = (task: RecipeTask) => {
    return isPathValid(task.src, false) && isPathValid(task.dest);
};

const taskUnzip = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorUnzip(task)) throw new Error('invalid options');

    const srcPath = safePath(basePath, task.src as string);
    const destPath = safePath(basePath, task.dest as string);
    await fsp.mkdir(destPath, { recursive: true });

    const zip = new StreamZip.async({ file: srcPath });
    try {
        const entries = Object.values(await zip.entries());
        assertZipEntriesSafe(entries, destPath);
        const count = await zip.extract(null, destPath);
        console.log(`Extracted ${count} entries`);
    } finally {
        await zip.close();
    }
};

//=============================================================
//== move_path
//=============================================================
const validatorMovePath = (task: RecipeTask) => {
    return isPathValid(task.src, false) && isPathValid(task.dest, false);
};

const taskMovePath = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorMovePath(task)) throw new Error('invalid options');

    const srcPath = safePath(basePath, task.src as string);
    const destPath = safePath(basePath, task.dest as string);
    await movePath(srcPath, destPath, task.overwrite === 'true' || task.overwrite === true);
};

//=============================================================
//== copy_path
//=============================================================
const validatorCopyPath = (task: RecipeTask) => {
    return isPathValid(task.src) && isPathValid(task.dest);
};

const taskCopyPath = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorCopyPath(task)) throw new Error('invalid options');

    const srcPath = safePath(basePath, task.src as string);
    const destPath = safePath(basePath, task.dest as string);
    const cpOptions: Parameters<typeof fsp.cp>[2] = {
        recursive: true,
        force: task.overwrite === 'true' || task.overwrite === true,
    };
    if (typeof task.filter === 'string' && task.filter.length) {
        const filterGlob = task.filter;
        cpOptions!.filter = (src: string) => {
            try {
                if (fs.statSync(src).isDirectory()) return true;
            } catch {
                /* statSync may fail for broken symlinks */
            }
            return (path as any).matchesGlob(src, filterGlob);
        };
    }
    await fsp.cp(srcPath, destPath, cpOptions);
};

//=============================================================
//== write_file
//=============================================================
const validatorWriteFile = (task: RecipeTask) => {
    return typeof task.data === 'string' && task.data.length > 0 && isPathValid(task.file, false);
};

const taskWriteFile = async (task: RecipeTask, basePath: string, _ctx: DeployerContext) => {
    if (!validatorWriteFile(task)) throw new Error('invalid options');

    const filePath = safePath(basePath, task.file as string);
    if (task.append === 'true' || task.append === true) {
        await fsp.appendFile(filePath, task.data as string);
    } else {
        await outputFile(filePath, task.data as string);
    }
};

//=============================================================
//== replace_string
//=============================================================
const validatorReplaceString = (task: RecipeTask) => {
    //Validate file
    const fileList = Array.isArray(task.file) ? task.file : [task.file];
    if (fileList.some((s) => !isPathValid(s, false))) {
        return false;
    }

    //Validate mode
    if (task.mode === undefined || task.mode === 'template' || task.mode === 'literal') {
        return typeof task.search === 'string' && task.search.length > 0 && typeof task.replace === 'string';
    } else if (task.mode === 'all_vars') {
        return true;
    } else {
        return false;
    }
};

const taskReplaceString = async (task: RecipeTask, basePath: string, ctx: DeployerContext) => {
    if (!validatorReplaceString(task)) throw new Error('invalid options');

    const fileList = Array.isArray(task.file) ? (task.file as string[]) : [task.file as string];
    //Pre-compute regex and replacement value outside the file loop
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex =
        task.mode === undefined || task.mode === 'template' || task.mode === 'literal'
            ? new RegExp(task.mode === 'literal' ? escapeRegExp(task.search as string) : (task.search as string), 'g')
            : null;
    const replacedValue =
        task.mode === undefined || task.mode === 'template'
            ? replaceVars(task.replace as string, ctx)
            : (task.replace as string);

    await Promise.all(
        fileList.map(async (file) => {
            const filePath = safePath(basePath, file);
            const original = await fsp.readFile(filePath, 'utf8');
            let changed: string;
            if (task.mode === 'all_vars') {
                changed = replaceVars(original, ctx);
            } else if (searchRegex) {
                changed = original.replace(searchRegex, replacedValue);
            } else {
                changed = original;
            }
            await fsp.writeFile(filePath, changed);
        }),
    );
};

//=============================================================
//== connect_database
//=============================================================
const validatorConnectDatabase = (_task: RecipeTask) => {
    return true;
};

const taskConnectDatabase = async (_task: RecipeTask, _basePath: string, ctx: DeployerContext) => {
    if (typeof ctx.dbHost !== 'string') throw new Error('invalid dbHost');
    if (typeof ctx.dbPort !== 'string' && typeof (ctx as any).dbPort !== 'number') throw new Error('invalid dbPort');
    if (typeof ctx.dbUsername !== 'string') throw new Error('invalid dbUsername');
    if (typeof ctx.dbPassword !== 'string') throw new Error('dbPassword should be a string');
    if (typeof ctx.dbName !== 'string') throw new Error('dbName should be a string');
    if (typeof ctx.dbDelete !== 'string' && typeof (ctx as any).dbDelete !== 'boolean')
        throw new Error('dbDelete should be a string or boolean');

    const dbPort = typeof (ctx as any).dbPort === 'number' ? (ctx as any).dbPort : parseInt(ctx.dbPort);
    const dbDelete = (ctx as any).dbDelete === true || ctx.dbDelete === 'true';

    const mysqlOptions = {
        host: ctx.dbHost,
        port: dbPort,
        user: ctx.dbUsername,
        password: ctx.dbPassword,
        multipleStatements: true,
    };
    ctx.dbConnection = await mysql.createConnection(mysqlOptions);
    const escapedDBName = mysql.escapeId(ctx.dbName);
    if (dbDelete) {
        await ctx.dbConnection.query(`DROP DATABASE IF EXISTS ${escapedDBName}`);
    }
    await ctx.dbConnection.query(
        `CREATE DATABASE IF NOT EXISTS ${escapedDBName} CHARACTER SET utf8 COLLATE utf8_general_ci`,
    );
    await ctx.dbConnection.query(`USE ${escapedDBName}`);
};

//=============================================================
//== query_database
//=============================================================
const validatorQueryDatabase = (task: RecipeTask) => {
    if (typeof task.file !== 'undefined' && typeof task.query !== 'undefined') return false;
    if (typeof task.file === 'string') return isPathValid(task.file, false);
    if (typeof task.query === 'string') return task.query.length > 0;
    return false;
};

const taskQueryDatabase = async (task: RecipeTask, basePath: string, ctx: DeployerContext) => {
    if (!validatorQueryDatabase(task)) throw new Error('invalid options');
    if (!ctx.dbConnection) {
        throw new Error('Database connection not found. Run connect_database before query_database');
    }

    let sql: string;
    if (task.file) {
        const filePath = safePath(basePath, task.file as string);
        sql = await fsp.readFile(filePath, 'utf8');
    } else {
        sql = task.query as string;
    }
    await ctx.dbConnection.query(sql);
};

//=============================================================
//== load_vars
//=============================================================
const validatorLoadVars = (task: RecipeTask) => {
    return isPathValid(task.src, false);
};

const taskLoadVars = async (task: RecipeTask, basePath: string, ctx: DeployerContext) => {
    if (!validatorLoadVars(task)) throw new Error('invalid options');

    const srcPath = safePath(basePath, task.src as string);
    const rawData = await fsp.readFile(srcPath, 'utf8');
    const inData = JSON.parse(rawData);
    //Protect internal keys from being overwritten
    delete inData.dbConnection;
    delete inData.$step;
    Object.assign(ctx, inData);
};

//=============================================================
//== Debug tasks
//=============================================================
const validatorWasteTime = (task: RecipeTask) => {
    return typeof task.seconds === 'number';
};

const taskWasteTime = (task: RecipeTask, _basePath: string, _ctx: DeployerContext) => {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), (task.seconds as number) * 1000);
    });
};

const taskFailTest = async () => {
    throw new Error('test error :p');
};

const taskDumpVars = async (_task: RecipeTask, _basePath: string, ctx: DeployerContext) => {
    const toDump = { ...ctx, dbConnection: ctx.dbConnection?.constructor?.name };
    console.dir(toDump);
};

//=============================================================
//== Exports
//=============================================================
const recipeEngine: RecipeEngineMap = {
    download_file: {
        validate: validatorDownloadFile,
        run: taskDownloadFile,
        timeoutSeconds: 180,
    },
    download_github: {
        validate: validatorDownloadGithub,
        run: taskDownloadGithub,
        timeoutSeconds: 180,
    },
    remove_path: {
        validate: validatorRemovePath,
        run: taskRemovePath,
        timeoutSeconds: 15,
    },
    ensure_dir: {
        validate: validatorEnsureDir,
        run: taskEnsureDir,
        timeoutSeconds: 15,
    },
    unzip: {
        validate: validatorUnzip,
        run: taskUnzip,
        timeoutSeconds: 180,
    },
    move_path: {
        validate: validatorMovePath,
        run: taskMovePath,
        timeoutSeconds: 180,
    },
    copy_path: {
        validate: validatorCopyPath,
        run: taskCopyPath,
        timeoutSeconds: 180,
    },
    write_file: {
        validate: validatorWriteFile,
        run: taskWriteFile,
        timeoutSeconds: 15,
    },
    replace_string: {
        validate: validatorReplaceString,
        run: taskReplaceString,
        timeoutSeconds: 15,
    },
    connect_database: {
        validate: validatorConnectDatabase,
        run: taskConnectDatabase,
        timeoutSeconds: 30,
    },
    query_database: {
        validate: validatorQueryDatabase,
        run: taskQueryDatabase,
        timeoutSeconds: 90,
    },
    load_vars: {
        validate: validatorLoadVars,
        run: taskLoadVars,
        timeoutSeconds: 5,
    },

    //Debug only
    waste_time: {
        validate: validatorWasteTime,
        run: taskWasteTime,
        timeoutSeconds: 300,
    },
    fail_test: {
        validate: () => true,
        run: taskFailTest,
        timeoutSeconds: 300,
    },
    dump_vars: {
        validate: () => true,
        run: taskDumpVars,
        timeoutSeconds: 5,
    },
};

export default recipeEngine;
