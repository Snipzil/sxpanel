import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { afterEach, expect, it, suite } from 'vitest';
import { getConfiguredServerIconPath } from './fxsConfigHelper';

const tempDirs: string[] = [];

const createServerDataPath = async () => {
    const serverDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'fxpanel-server-icon-'));
    tempDirs.push(serverDataPath);
    return serverDataPath;
};

const writeServerDataFile = async (serverDataPath: string, relativePath: string, content: string | Buffer) => {
    const absolutePath = path.join(serverDataPath, relativePath);
    await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsp.writeFile(absolutePath, content);
    return absolutePath;
};

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dirPath) => fsp.rm(dirPath, { recursive: true, force: true })));
});

suite('getConfiguredServerIconPath', () => {
    it('returns the icon configured in the main server cfg', async () => {
        const serverDataPath = await createServerDataPath();
        const expectedPath = await writeServerDataFile(serverDataPath, 'logo.png', 'png');
        await writeServerDataFile(serverDataPath, 'server.cfg', 'load_server_icon logo.png\n');

        const result = await getConfiguredServerIconPath('server.cfg', serverDataPath);

        expect(result).toBe(expectedPath);
    });

    it('returns the last icon configured across exec recursion', async () => {
        const serverDataPath = await createServerDataPath();
        await writeServerDataFile(serverDataPath, 'first.png', 'png');
        const expectedPath = await writeServerDataFile(serverDataPath, 'second.png', 'png');
        await writeServerDataFile(
            serverDataPath,
            'server.cfg',
            ['load_server_icon first.png', 'exec extra.cfg'].join('\n'),
        );
        await writeServerDataFile(serverDataPath, 'extra.cfg', 'load_server_icon second.png\n');

        const result = await getConfiguredServerIconPath('server.cfg', serverDataPath);

        expect(result).toBe(expectedPath);
    });

    it('resolves the icon relative to the cfg file that declared it', async () => {
        const serverDataPath = await createServerDataPath();
        const expectedPath = await writeServerDataFile(serverDataPath, 'configs/logo.webp', 'webp');
        await writeServerDataFile(serverDataPath, 'configs/server.cfg', 'load_server_icon logo.webp\n');

        const result = await getConfiguredServerIconPath('configs/server.cfg', serverDataPath);

        expect(result).toBe(expectedPath);
    });

    it('resolves exec and load_server_icon relative to the cfg file that contains each command', async () => {
        const serverDataPath = await createServerDataPath();
        const expectedPath = await writeServerDataFile(serverDataPath, 'configs/nested/logo.gif', 'gif');
        await writeServerDataFile(serverDataPath, 'server.cfg', 'exec configs/nested/extra.cfg\n');
        await writeServerDataFile(serverDataPath, 'configs/nested/extra.cfg', 'load_server_icon logo.gif\n');

        const result = await getConfiguredServerIconPath('server.cfg', serverDataPath);

        expect(result).toBe(expectedPath);
    });

    it('returns null when no server icon is configured', async () => {
        const serverDataPath = await createServerDataPath();
        await writeServerDataFile(serverDataPath, 'server.cfg', 'sets sv_projectName "Southbank RP"\n');

        const result = await getConfiguredServerIconPath('server.cfg', serverDataPath);

        expect(result).toBeNull();
    });
});