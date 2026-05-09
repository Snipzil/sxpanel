import { z } from 'zod';
import consts from './consts';

// Login
export const verifyPasswordBodySchema = z.object({
    username: z.string().trim(),
    password: z.string(),
});
export type ApiVerifyPasswordReqSchema = z.infer<typeof verifyPasswordBodySchema>;

// Add Master flow
export const addMasterPinBodySchema = z.object({
    pin: z.string().trim(),
    origin: z.string().url().max(256),
});
export type ApiAddMasterPinReqSchema = z.infer<typeof addMasterPinBodySchema>;

export const addMasterCallbackBodySchema = z.object({
    payload: z.string().min(1),
});
export type ApiAddMasterCallbackReqSchema = z.infer<typeof addMasterCallbackBodySchema>;

export const addMasterSaveBodySchema = z.object({
    password: z.string().min(consts.adminPasswordMinLength).max(consts.adminPasswordMaxLength),
    discordId: z.string().optional(),
});
export type ApiAddMasterSaveReqSchema = z.infer<typeof addMasterSaveBodySchema>;

// Password & identifier changes
export const changePasswordBodySchema = z.object({
    oldPassword: z.string().optional(),
    newPassword: z.string().min(consts.adminPasswordMinLength).max(consts.adminPasswordMaxLength),
});
export type ApiChangePasswordReqSchema = z.infer<typeof changePasswordBodySchema>;

export const changeIdentifiersBodySchema = z.object({
    cfxreId: z.string().trim(),
    discordId: z.string().trim(),
});
export type ApiChangeIdentifiersReqSchema = z.infer<typeof changeIdentifiersBodySchema>;

// TOTP
export const totpConfirmBodySchema = z.object({
    code: z.string().trim().length(6),
});

export const totpVerifyBodySchema = z.object({
    code: z.string().trim().min(1),
});

export const totpDisableBodySchema = z.object({
    password: z.string().min(1),
    code: z.string().trim().min(1),
});

// Discourse OAuth
export const discourseRedirectQuerySchema = z.object({
    origin: z.string(),
});

export const discourseCallbackBodySchema = z.object({
    payload: z.string().min(1),
});

// Discord OAuth
export const discordRedirectQuerySchema = z.object({
    origin: z.string(),
});

export const discordCallbackBodySchema = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
});
