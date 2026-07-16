import { z } from 'zod';
import consts from './consts';
import { validateAdminPassword } from './passwordPolicy';

const adminPasswordSchema = z
    .string()
    .min(consts.adminPasswordMinLength)
    .max(consts.adminPasswordMaxLength)
    .superRefine((password, ctx) => {
        const result = validateAdminPassword(password);
        if (!result.ok) {
            ctx.addIssue({ code: 'custom', message: result.error });
        }
    });

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
    redirectUri: z.string(),
});
export type ApiAddMasterCallbackReqSchema = z.infer<typeof addMasterCallbackBodySchema>;

export const addMasterSaveBodySchema = z.object({
    password: adminPasswordSchema,
    discordId: z.string().optional(),
});
export type ApiAddMasterSaveReqSchema = z.infer<typeof addMasterSaveBodySchema>;

// Password & identifier changes
export const changePasswordBodySchema = z.object({
    oldPassword: z.string().optional(),
    newPassword: adminPasswordSchema,
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

// Cfx.re (CitizenFX) OAuth
export const cfxreRedirectQuerySchema = z.object({
    origin: z.string(),
});

export const cfxreCallbackBodySchema = z.object({
    redirectUri: z.string(),
});
export type ApiOauthCallbackReqSchema = z.infer<typeof cfxreCallbackBodySchema>;

// Discord OAuth
export const discordRedirectQuerySchema = z.object({
    origin: z.string(),
});

export const discordCallbackBodySchema = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
});
