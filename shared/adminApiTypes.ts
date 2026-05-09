import type { PermissionPreset } from './permissions';
import type { GenericApiErrorResp } from './genericApiTypes';

// ── Admin list ──

export type AdminListItem = {
    name: string;
    isMaster: boolean;
    hasCitizenFx: boolean;
    citizenfxId: string;
    hasDiscord: boolean;
    discordId: string;
    permissions: string[];
    effectivePermissions?: string[];
    isYou: boolean;
    isOnline: boolean;
};

export type ApiGetAdminListResp = {
    admins: AdminListItem[];
};

// ── Admin add / edit ──

export type ApiAdminSaveReq = {
    /** New username (or unchanged username) */
    name: string;
    /** Original username when editing (for lookup). Omit when adding. */
    originalName?: string;
    citizenfxId: string;
    discordId: string;
    permissions: string[];
};

export type ApiAdminSaveResp =
    | {
          type: 'success';
          refresh?: boolean;
      }
    | {
          type: 'showPassword';
          password: string;
      }
    | {
          type: 'danger';
          message: string;
      };

// ── Admin delete ──

export type ApiAdminDeleteReq = {
    name: string;
};

export type ApiAdminDeleteResp =
    | {
          type: 'success';
      }
    | {
          type: 'danger';
          message: string;
      };

// ── Permission presets ──

export type ApiGetPresetsResp = {
    presets: PermissionPreset[];
};

export type ApiSavePresetsReq = {
    presets: PermissionPreset[];
};

export type ApiSavePresetsResp =
    | {
          type: 'success';
      }
    | {
          type: 'danger';
          message: string;
      };

// ── Admin stats ──

export type AdminStatsEntry = {
    totalBans: number;
    totalWarns: number;
    totalKicks: number;
    revokedActions: number;
    totalActions: number;
    totalTicketsResolved: number;
};

export type ApiGetAdminStatsResp =
    | {
          stats: Record<string, AdminStatsEntry>;
      }
    | GenericApiErrorResp;

export type AdminRecentAction = {
    id: string;
    type: 'ban' | 'warn' | 'kick';
    playerName: string | false;
    playerLicense: string | null;
    reason: string;
    timestamp: number;
    isRevoked: boolean;
};

export type ApiGetAdminActionsResp =
    | {
          actions: AdminRecentAction[];
      }
    | GenericApiErrorResp;
