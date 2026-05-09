import { beforeEach, expect, suite, it, vi } from 'vitest';
import { createMockCtx } from '@core/testing/routeTestUtils';
import { ticketsDelete, ticketsRetentionExclusion } from './reports';

const mockDeleteTicket = vi.fn();
const mockSetExcludeFromAutoDeletion = vi.fn();
const mockAddActivityEntry = vi.fn();

vi.stubGlobal('txConfig', {
    gameFeatures: {
        reportsEnabled: true,
    },
});

vi.stubGlobal('txCore', {
    database: {
        tickets: {
            delete: mockDeleteTicket,
            setExcludeFromAutoDeletion: mockSetExcludeFromAutoDeletion,
            addActivityEntry: mockAddActivityEntry,
        },
    },
});

beforeEach(() => {
    vi.clearAllMocks();
});

suite('ticketsDelete', () => {
    it('rejects without manage_tickets permission', async () => {
        const { ctx, sentData } = createMockCtx({
            body: { id: 'TKT-12345' },
            permissions: ['players.reports'],
        });

        await ticketsDelete(ctx);

        expect(sentData[0]).toEqual({ error: 'Unauthorized' });
        expect(mockDeleteTicket).not.toHaveBeenCalled();
    });

    it('rejects invalid requests', async () => {
        const { ctx, sentData } = createMockCtx({
            body: {},
            permissions: ['manage_tickets'],
        });

        await ticketsDelete(ctx);

        expect(sentData[0]).toEqual({ error: 'Invalid request.' });
        expect(mockDeleteTicket).not.toHaveBeenCalled();
    });

    it('deletes the ticket and logs the action', async () => {
        mockDeleteTicket.mockReturnValue(true);
        const { ctx, sentData } = createMockCtx({
            body: { id: 'TKT-12345' },
            permissions: ['manage_tickets'],
        });

        await ticketsDelete(ctx);

        expect(mockDeleteTicket).toHaveBeenCalledWith('TKT-12345');
        expect(ctx.admin.logAction).toHaveBeenCalledWith('Deleted ticket TKT-12345.', 'ticket.delete');
        expect(sentData[0]).toEqual({ success: true });
    });
});

suite('ticketsRetentionExclusion', () => {
    it('rejects without manage_tickets permission', async () => {
        const { ctx, sentData } = createMockCtx({
            body: { id: 'TKT-12345', excludeFromAutoDeletion: true },
            permissions: ['players.reports'],
        });

        await ticketsRetentionExclusion(ctx);

        expect(sentData[0]).toEqual({ error: 'Unauthorized' });
        expect(mockSetExcludeFromAutoDeletion).not.toHaveBeenCalled();
    });

    it('rejects invalid requests', async () => {
        const { ctx, sentData } = createMockCtx({
            body: { id: 'TKT-12345' },
            permissions: ['manage_tickets'],
        });

        await ticketsRetentionExclusion(ctx);

        expect(sentData[0]).toEqual({ error: 'Invalid request.' });
        expect(mockSetExcludeFromAutoDeletion).not.toHaveBeenCalled();
    });

    it('updates the ticket retention exclusion and logs the action', async () => {
        mockSetExcludeFromAutoDeletion.mockReturnValue(true);
        const { ctx, sentData } = createMockCtx({
            body: { id: 'TKT-12345', excludeFromAutoDeletion: true },
            permissions: ['manage_tickets'],
        });

        await ticketsRetentionExclusion(ctx);

        expect(mockSetExcludeFromAutoDeletion).toHaveBeenCalledWith('TKT-12345', true);
        expect(mockAddActivityEntry).toHaveBeenCalledWith(
            'TKT-12345',
            expect.objectContaining({
                adminName: 'testadmin',
                action: 'auto_delete_excluded',
            }),
        );
        expect(ctx.admin.logAction).toHaveBeenCalledWith(
            'Excluded ticket TKT-12345 from auto deletion.',
            'ticket.retention.exclude',
        );
        expect(sentData[0]).toEqual({ success: true, excludeFromAutoDeletion: true });
    });
});