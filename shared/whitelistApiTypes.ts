import { GenericApiErrorResp } from './genericApiTypes';
import type { WhitelistEventType, WhitelistForm, WhitelistWorkflow } from './whitelistTypes';

export type WhitelistEntry = {
    name: string;
    identifier: string;
    approvedBy: string;
    tsApproved: number;
    source?: string;
};

export type WhitelistRequestEntry = {
    id: string;
    license: string;
    playerDisplayName: string;
    discordTag?: string;
    discordAvatar?: string;
    tsLastAttempt: number;
    workflowId?: string;
    status?: string;
};

export type ApiWhitelistPlayersResp =
    | {
          cntTotal: number;
          cntFiltered: number;
          totalPages: number;
          currPage: number;
          players: WhitelistEntry[];
      }
    | GenericApiErrorResp;

export type ApiWhitelistRequestsResp =
    | {
          cntTotal: number;
          cntFiltered: number;
          newest: number;
          totalPages: number;
          currPage: number;
          requests: WhitelistRequestEntry[];
      }
    | GenericApiErrorResp;

export type ApiWhitelistApprovalsResp = WhitelistEntry[] | GenericApiErrorResp;

export type ApiWhitelistConfigResp =
    | {
          enabled: boolean;
          workflows: WhitelistWorkflow[];
          activeWorkflowId: string;
          forms: WhitelistForm[];
      }
    | GenericApiErrorResp;

export type WhitelistAnalyticsSummary = {
    totalEntries: number;
    activePlayers: number;
    pendingPreApprovals: number;
    pendingApplications: number;
    approvedApplications: number;
    deniedApplications: number;
    avgApprovalWaitSeconds: number | null;
    medianApprovalWaitSeconds: number | null;
    pendingOlderThan24h: number;
    applicationsCreatedInPeriod: number;
    eventsInPeriod: number;
    eventCounts: Partial<Record<WhitelistEventType, number>>;
    connectedLast7d: number;
    periodDays: number;
};

export type ApiWhitelistAnalyticsResp = WhitelistAnalyticsSummary | GenericApiErrorResp;

export type ApiWhitelistBulkImportResp = { success: true; imported: number; skipped: number } | GenericApiErrorResp;

export type ApiWhitelistBulkExportResp = { entries: WhitelistEntry[] } | GenericApiErrorResp;
