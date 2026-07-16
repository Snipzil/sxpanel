import type { ApiAuthErrorResp } from './genericApiTypes';
import type {
    ApiVerifyPasswordReqSchema,
    ApiAddMasterPinReqSchema,
    ApiAddMasterCallbackReqSchema,
    ApiAddMasterSaveReqSchema,
    ApiChangePasswordReqSchema,
    ApiChangeIdentifiersReqSchema,
    ApiOauthCallbackReqSchema,
} from './authApiSchemas';

export type ReactAuthDataType = {
    name: string;
    permissions: string[];
    isMaster: boolean;
    isTempPassword: boolean;
    passwordRevision?: number;
    profilePicture?: string;
    csrfToken?: string;
    totpEnabled?: boolean;
};

export type ApiSelfResp = ApiAuthErrorResp | ReactAuthDataType;

export type ApiLogoutResp = {
    logout: true;
};

export type ApiVerifyPasswordReq = ApiVerifyPasswordReqSchema;
export type ApiVerifyPasswordResp =
    | {
          error: string;
      }
    | {
          totp_required: true;
      }
    | ReactAuthDataType;

// 2FA (TOTP) API types
export type ApiTotpSetupResp = { error: string } | { secret: string; uri: string };

export type ApiTotpConfirmResp = { error: string } | { success: true; backupCodes: string[] };

export type ApiTotpVerifyResp = { error: string } | ReactAuthDataType;

export type ApiTotpDisableResp = { error: string } | { success: true };

export type ApiOauthRedirectResp =
    | {
          authUrl: string;
      }
    | {
          error: string;
      };

export type ApiOauthCallbackErrorResp =
    | {
          errorCode: string;
          errorContext?: {
              [key: string]: string;
          };
      }
    | {
          errorTitle: string;
          errorMessage: string;
      };
export type ApiOauthCallbackResp = ApiOauthCallbackErrorResp | ReactAuthDataType;
export type ApiOauthCallbackReq = ApiOauthCallbackReqSchema;

export type ApiAddMasterPinReq = ApiAddMasterPinReqSchema;
export type ApiAddMasterPinResp = ApiOauthRedirectResp;

export type ApiAddMasterCallbackReq = ApiAddMasterCallbackReqSchema;
export type ApiAddMasterCallbackFivemData = {
    fivemName: string;
    fivemId: string;
    profilePicture?: string;
};
export type ApiAddMasterCallbackResp = ApiOauthCallbackErrorResp | ApiAddMasterCallbackFivemData;

export type ApiAddMasterSaveReq = ApiAddMasterSaveReqSchema;
export type ApiAddMasterSaveResp =
    | {
          error: string;
      }
    | ReactAuthDataType;

export type ApiChangePasswordReq = ApiChangePasswordReqSchema;
export type ApiChangeIdentifiersReq = ApiChangeIdentifiersReqSchema;
