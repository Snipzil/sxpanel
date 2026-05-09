import { expect, it, suite, vi } from 'vitest';
import { buildDiscordCardMessageFromEmbed, discordMessageFlagIsComponentsV2 } from './componentsV2';

const mocks = vi.hoisted(() => {
    return {
        findPlayersByIdentifier: vi.fn(),
        playerResolver: vi.fn(),
        handleSaveNote: vi.fn(),
        handleWarning: vi.fn(),
        handleBan: vi.fn(),
        handleKick: vi.fn(),
        handleRevokeAction: vi.fn(),
    };
});

vi.mock('@lib/player/playerFinder', () => ({
    findPlayersByIdentifier: mocks.findPlayersByIdentifier,
}));

vi.mock('@lib/player/playerResolver', () => ({
    default: mocks.playerResolver,
}));

vi.mock('@routes/player/actions', () => ({
    handleSaveNote: mocks.handleSaveNote,
    handleWarning: mocks.handleWarning,
    handleBan: mocks.handleBan,
    handleKick: mocks.handleKick,
}));

vi.mock('@routes/history/actions', () => ({
    handleRevokeAction: mocks.handleRevokeAction,
}));

import { handleModerationCommand } from './moderationCommands';

const buildReply = (type: string, description: string, ephemeral = false) => {
    return buildDiscordCardMessageFromEmbed(
        {
            description,
            color: 0x123456,
            ...(type.length ? { title: type } : {}),
        },
        {
            flags: ephemeral ? 64 : undefined,
        },
    );
};

const stringifyReplyComponents = (reply: { components?: Record<string, unknown>[] }) => {
    return JSON.stringify(reply.components ?? []);
};

const createDeps = (admin?: { name: string; permissions?: string[]; isMaster?: boolean }) => {
    return {
        buildReply,
        adminStore: {
            getAdminByProviderUID: vi.fn(() => admin),
            registeredPermissions: {
                'players.warn': 'Warn',
                'players.ban': 'Ban',
                'players.kick': 'Kick',
                'players.unban': 'Unban',
            },
        },
        logAction: vi.fn(),
        now: () => 1_700_000_000,
        infoEmbedColor: 0x123456,
        footer: { text: 'fxPanel test' },
    };
};

const createPlayer = (overrides: Partial<any> = {}) => {
    return {
        license: 'license:target',
        displayName: 'Target Player',
        getDbData: vi.fn(() => ({
            notes: {
                text: 'Keep an eye on them.',
                lastAdmin: 'Admin',
                tsLastEdit: 1_699_999_900,
            },
        })),
        getHistory: vi.fn(() => []),
        ...overrides,
    };
};

const resetMocks = () => {
    mocks.findPlayersByIdentifier.mockReset();
    mocks.playerResolver.mockReset();
    mocks.handleSaveNote.mockReset();
    mocks.handleWarning.mockReset();
    mocks.handleBan.mockReset();
    mocks.handleKick.mockReset();
    mocks.handleRevokeAction.mockReset();
};

suite('DiscordBot moderationCommands', () => {
    it('requires a linked fxPanel admin account for moderation commands', async () => {
        resetMocks();

        const response = await handleModerationCommand(
            {
                command: 'warn',
                requesterId: '123456789012345678',
                memberRoles: ['discord-role-admin'],
                searchId: 'discord:123456789012345678',
                reason: 'Testing',
            },
            createDeps(),
        );

        expect(stringifyReplyComponents(response.reply)).toContain('does not have fxPanel access');
        expect(mocks.findPlayersByIdentifier).not.toHaveBeenCalled();
    });

    it('warns a player with the linked admin permissions', async () => {
        resetMocks();
        const player = createPlayer();
        mocks.findPlayersByIdentifier.mockReturnValue([player]);
        mocks.playerResolver.mockReturnValue(player);
        mocks.handleWarning.mockResolvedValue({ success: true });

        const response = await handleModerationCommand(
            {
                command: 'warn',
                requesterId: '123456789012345678',
                searchId: 'discord:123456789012345678',
                reason: 'Toxic behavior',
            },
            createDeps({ name: 'Admin', permissions: ['players.warn'] }),
        );

        expect(mocks.handleWarning).toHaveBeenCalledTimes(1);
        expect(mocks.handleWarning.mock.calls[0]?.[0]?.request?.body).toEqual({ reason: 'Toxic behavior' });
        expect(mocks.handleWarning.mock.calls[0]?.[0]?.admin?.name).toBe('Admin');
        expect(mocks.handleWarning.mock.calls[0]?.[1]).toBe(player);
        expect(response.reply.flags).toBe(64 | discordMessageFlagIsComponentsV2);
        expect(stringifyReplyComponents(response.reply)).toContain('Warned');
    });

    it('resolves serverid targets against the current playerlist', async () => {
        resetMocks();
        const player = createPlayer();
        mocks.playerResolver.mockReturnValue(player);
        mocks.handleKick.mockResolvedValue({ success: true });

        const response = await handleModerationCommand(
            {
                command: 'kick',
                requesterId: '123456789012345678',
                searchId: 'serverid:4',
                reason: 'Trolling',
            },
            createDeps({ name: 'Admin', permissions: ['players.kick'] }),
        );

        expect(mocks.playerResolver).toHaveBeenCalledWith(expect.any(Symbol), 4, undefined);
        expect(mocks.findPlayersByIdentifier).not.toHaveBeenCalled();
        expect(mocks.handleKick).toHaveBeenCalledTimes(1);
        expect(stringifyReplyComponents(response.reply)).toContain('Kicked');
    });

    it('revokes the single active ban found for a target player', async () => {
        resetMocks();
        const player = createPlayer({
            getHistory: vi.fn(() => [
                {
                    id: 'B0001',
                    type: 'ban',
                    author: 'Admin',
                    reason: 'Cheating',
                    timestamp: 1_699_999_000,
                    expiration: false,
                    playerName: 'Target Player',
                    ids: ['license:target'],
                },
            ]),
        });
        mocks.findPlayersByIdentifier.mockReturnValue([player]);
        mocks.playerResolver.mockReturnValue(player);
        mocks.handleRevokeAction.mockResolvedValue({ success: true });

        const response = await handleModerationCommand(
            {
                command: 'unban',
                requesterId: '123456789012345678',
                searchId: 'license:target',
                reason: 'Appeal accepted',
            },
            createDeps({ name: 'Admin', permissions: ['players.unban'] }),
        );

        expect(mocks.handleRevokeAction).toHaveBeenCalledTimes(1);
        expect(mocks.handleRevokeAction.mock.calls[0]?.[0]?.request?.body).toEqual({
            actionId: 'B0001',
            reason: 'Appeal accepted',
        });
        expect(stringifyReplyComponents(response.reply)).toContain('Revoked ban');
        expect(stringifyReplyComponents(response.reply)).toContain('B0001');
    });

    it('returns stored notes for a linked admin', async () => {
        resetMocks();
        const player = createPlayer();
        mocks.findPlayersByIdentifier.mockReturnValue([player]);
        mocks.playerResolver.mockReturnValue(player);

        const response = await handleModerationCommand(
            {
                command: 'notes',
                action: 'view',
                requesterId: '123456789012345678',
                searchId: 'license:target',
            },
            createDeps({ name: 'Admin', permissions: [] }),
        );

        expect(stringifyReplyComponents(response.reply)).toContain('Notes');
        expect(stringifyReplyComponents(response.reply)).toContain('Keep an eye on them.');
    });

    it('formats recent moderation history into an embed', async () => {
        resetMocks();
        const player = createPlayer({
            getHistory: vi.fn(() => [
                {
                    id: 'W0002',
                    type: 'warn',
                    author: 'Admin',
                    reason: 'Mic spam',
                    timestamp: 1_699_999_950,
                    acked: false,
                    playerName: 'Target Player',
                    ids: ['license:target'],
                },
                {
                    id: 'K0001',
                    type: 'kick',
                    author: 'Admin',
                    reason: 'AFK',
                    timestamp: 1_699_999_900,
                    playerName: 'Target Player',
                    ids: ['license:target'],
                },
            ]),
        });
        mocks.findPlayersByIdentifier.mockReturnValue([player]);
        mocks.playerResolver.mockReturnValue(player);

        const response = await handleModerationCommand(
            {
                command: 'history',
                requesterId: '123456789012345678',
                searchId: 'license:target',
                limit: 2,
            },
            createDeps({ name: 'Admin', permissions: [] }),
        );

        expect(stringifyReplyComponents(response.reply)).toContain('History');
        expect(stringifyReplyComponents(response.reply)).toContain('W0002 · WARN');
        expect(stringifyReplyComponents(response.reply)).toContain('K0001 · KICK');
    });
});