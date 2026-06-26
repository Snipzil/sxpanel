import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, useAdminPerms } from '@/hooks/auth';
import { memo, useEffect, useReducer, useState } from 'react';
import { TabsTrigger, TabsList, TabsContent, Tabs } from '@/components/ui/tabs';
import {
    ApiChangeIdentifiersReq,
    ApiChangePasswordReq,
    ApiTotpSetupResp,
    ApiTotpConfirmResp,
    ApiTotpDisableResp,
} from '@shared/authApiTypes';
import { useAccountModal, useCloseAccountModal } from '@/hooks/dialogs';
import { useLocale } from '@/hooks/locale';
import { GenericApiOkResp } from '@shared/genericApiTypes';
import { fetchWithTimeout, useAuthedFetcher, useBackendApi } from '@/hooks/fetch';
import { PASSWORD_POLICY_DESCRIPTION, validateAdminPassword } from '@shared/passwordPolicy';
import { txToast } from './TxToaster';
import useSWR from 'swr';
import TxAnchor from './TxAnchor';
import QRCode from 'qrcode';

type ChangeIdentifiersState = {
    cfxreId: string;
    discordId: string;
    error: string;
    isConvertingFivemId: boolean;
    isSaving: boolean;
};

function reduceChangeIdentifiersState(
    state: ChangeIdentifiersState,
    action: Partial<ChangeIdentifiersState>,
): ChangeIdentifiersState {
    return {
        ...state,
        ...action,
    };
}

type TwoFactorStep = 'status' | 'setup' | 'backup' | 'disable';

type TwoFactorState = {
    step: TwoFactorStep;
    setupSecret: string;
    qrDataUrl: string;
    verifyCode: string;
    backupCodes: string[];
    disablePassword: string;
    disableCode: string;
    error: string;
    isProcessing: boolean;
};

function reduceTwoFactorState(state: TwoFactorState, action: Partial<TwoFactorState>): TwoFactorState {
    return {
        ...state,
        ...action,
    };
}

function TwoFactorStatusStep({
    enabled,
    error,
    isProcessing,
    canDisable,
    onStartSetup,
    onStartDisable,
}: {
    enabled: boolean;
    error: string;
    isProcessing: boolean;
    canDisable: boolean;
    onStartSetup: () => void;
    onStartDisable: () => void;
}) {
    const { t } = useLocale();

    return (
        <div>
            <p className="text-muted-foreground text-sm">{t('panel.account.two_factor.status_description')}</p>
            <div className="mt-4 flex items-center justify-between rounded-md border p-3">
                <div>
                    <p className="text-sm font-medium">{t('panel.account.two_factor.status_label')}</p>
                    <p className={`text-sm ${enabled ? 'text-success' : 'text-muted-foreground'}`}>
                        {enabled ? t('panel.common.enabled') : t('panel.common.disabled')}
                    </p>
                </div>
                {enabled ? (
                    canDisable ? (
                        <Button variant="destructive" size="sm" onClick={onStartDisable}>
                            {t('panel.account.two_factor.disable_btn')}
                        </Button>
                    ) : (
                        <p className="text-muted-foreground text-xs">{t('panel.account.two_factor.required_policy')}</p>
                    )
                ) : (
                    <Button size="sm" onClick={onStartSetup} disabled={isProcessing}>
                        {isProcessing ? t('panel.common.loading') : t('panel.account.two_factor.enable_btn')}
                    </Button>
                )}
            </div>
            {error && <p className="text-destructive mt-2 text-center text-sm">{error}</p>}
        </div>
    );
}

function TwoFactorSetupStep({
    setupSecret,
    qrDataUrl,
    verifyCode,
    error,
    isProcessing,
    onCodeChange,
    onCancel,
    onConfirm,
}: {
    setupSecret: string;
    qrDataUrl: string;
    verifyCode: string;
    error: string;
    isProcessing: boolean;
    onCodeChange: (code: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    const { t } = useLocale();

    return (
        <div>
            <p className="text-muted-foreground mb-3 text-sm">{t('panel.account.two_factor.setup_description')}</p>
            <div className="mb-3 flex justify-center">
                {qrDataUrl ? (
                    <img
                        src={qrDataUrl}
                        alt={t('panel.account.two_factor.qr_alt')}
                        className="rounded-md border"
                        width={200}
                        height={200}
                    />
                ) : (
                    <p className="text-muted-foreground text-sm">{t('panel.account.two_factor.qr_unavailable')}</p>
                )}
            </div>
            <div className="mb-3">
                <p className="text-muted-foreground mb-1 text-xs">{t('panel.account.two_factor.manual_key')}</p>
                <code className="bg-muted block rounded p-2 text-center font-mono text-xs break-all select-all">
                    {setupSecret}
                </code>
            </div>
            <div className="space-y-2">
                <Label htmlFor="totp-verify-code">{t('panel.account.two_factor.verify_label')}</Label>
                <Input
                    id="totp-verify-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => onCodeChange(e.target.value)}
                />
            </div>
            {error && <p className="text-destructive mt-2 text-center text-sm">{error}</p>}
            <div className="mt-4 flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={onCancel}>
                    {t('panel.common.cancel')}
                </Button>
                <Button className="flex-1" onClick={onConfirm} disabled={isProcessing}>
                    {isProcessing
                        ? t('panel.account.two_factor.verifying')
                        : t('panel.account.two_factor.verify_enable')}
                </Button>
            </div>
        </div>
    );
}

function TwoFactorBackupStep({
    backupCodes,
    onCopy,
    onFinish,
}: {
    backupCodes: string[];
    onCopy: () => void;
    onFinish: () => void;
}) {
    const { t } = useLocale();

    return (
        <div>
            <p className="text-warning-inline mb-3 text-sm font-medium">
                {t('panel.account.two_factor.backup_warning')}
            </p>
            <div className="bg-muted mb-3 rounded-md p-3">
                <div className="grid grid-cols-2 gap-1 font-mono text-sm">
                    {backupCodes.map((code) => (
                        <div key={code} className="text-center">
                            {code}
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onCopy}>
                    {t('panel.account.two_factor.copy_codes')}
                </Button>
                <Button className="flex-1" onClick={onFinish}>
                    {t('panel.account.two_factor.finish_setup')}
                </Button>
            </div>
        </div>
    );
}

function TwoFactorDisableStep({
    disablePassword,
    disableCode,
    error,
    isProcessing,
    onPasswordChange,
    onCodeChange,
    onCancel,
    onDisable,
}: {
    disablePassword: string;
    disableCode: string;
    error: string;
    isProcessing: boolean;
    onPasswordChange: (password: string) => void;
    onCodeChange: (code: string) => void;
    onCancel: () => void;
    onDisable: () => void;
}) {
    const { t } = useLocale();

    return (
        <div>
            <p className="text-muted-foreground mb-3 text-sm">{t('panel.account.two_factor.disable_description')}</p>
            <div className="space-y-3 pb-4">
                <div className="space-y-1">
                    <Label htmlFor="disable-password">{t('panel.account.two_factor.password_label')}</Label>
                    <Input
                        id="disable-password"
                        type="password"
                        placeholder={t('panel.account.two_factor.password_placeholder')}
                        value={disablePassword}
                        onChange={(e) => onPasswordChange(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="disable-code">{t('panel.account.two_factor.code_label')}</Label>
                    <Input
                        id="disable-code"
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        maxLength={6}
                        value={disableCode}
                        onChange={(e) => onCodeChange(e.target.value)}
                    />
                </div>
            </div>
            {error && <p className="text-destructive -mt-2 mb-4 text-center text-sm">{error}</p>}
            <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" onClick={onCancel}>
                    {t('panel.common.cancel')}
                </Button>
                <Button variant="destructive" className="flex-1" onClick={onDisable} disabled={isProcessing}>
                    {isProcessing ? t('panel.account.two_factor.disabling') : t('panel.account.two_factor.disable_btn')}
                </Button>
            </div>
        </div>
    );
}

/**
 * Change Password tab
 */
const ChangePasswordTab = memo(function () {
    const { t } = useLocale();
    const { authData, setAuthData } = useAuth();
    const { setAccountModalTab } = useAccountModal();
    const closeAccountModal = useCloseAccountModal();
    const changePasswordApi = useBackendApi<GenericApiOkResp, ApiChangePasswordReq>({
        method: 'POST',
        path: '/auth/changePassword',
    });

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        if (!authData) return;
        setError('');

        const policyResult = validateAdminPassword(newPassword);
        if (!policyResult.ok) {
            setError(policyResult.error);
            return;
        }
        if (newPassword !== newPasswordConfirm) {
            setError(t('panel.account.password.mismatch'));
            return;
        }

        setIsSaving(true);
        changePasswordApi({
            data: {
                newPassword,
                oldPassword: authData.isTempPassword ? undefined : oldPassword,
            },
            error: (error) => {
                setIsSaving(false);
                setError(error);
            },
            success: (data) => {
                setIsSaving(false);
                if ('success' in data) {
                    if (authData.isTempPassword) {
                        setAccountModalTab('identifiers');
                        setAuthData((prev) =>
                            prev
                                ? {
                                      ...prev,
                                      isTempPassword: false,
                                  }
                                : prev,
                        );
                    } else {
                        txToast.success(t('panel.account.password.success'));
                        closeAccountModal();
                    }
                } else {
                    setError(data.error);
                }
            },
        });
    };

    if (!authData) return;
    return (
        <TabsContent value="password" tabIndex={undefined}>
            <form onSubmit={handleSubmit}>
                {authData.isTempPassword ? (
                    <p className="text-warning-inline text-sm">
                        {t('panel.account.password.temp_warning')} <br />
                        <strong>{t('panel.account.password.temp_note')}</strong>
                    </p>
                ) : (
                    <p className="text-muted-foreground text-sm">{t('panel.account.password.description')}</p>
                )}
                <p className="text-muted-foreground pt-2 text-xs">{PASSWORD_POLICY_DESCRIPTION}</p>
                <div className="space-y-3 pt-2 pb-6">
                    {!authData.isTempPassword && (
                        <div className="space-y-1">
                            <Label htmlFor="current-password">{t('panel.account.password.current_label')}</Label>
                            <Input
                                id="current-password"
                                placeholder={t('panel.account.password.current_placeholder')}
                                type="password"
                                value={oldPassword}
                                required
                                onChange={(e) => {
                                    setOldPassword(e.target.value);
                                    setError('');
                                }}
                            />
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label htmlFor="new-password">{t('panel.account.password.new_label')}</Label>
                        <Input
                            id="new-password"
                            autoComplete="new-password"
                            placeholder={t('panel.account.password.new_placeholder')}
                            type="password"
                            value={newPassword}
                            required
                            onChange={(e) => {
                                setNewPassword(e.target.value);
                                setError('');
                            }}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="confirm-password">{t('panel.account.password.confirm_label')}</Label>
                        <Input
                            id="confirm-password"
                            autoComplete="new-password"
                            placeholder={t('panel.account.password.confirm_placeholder')}
                            type="password"
                            required
                            onChange={(e) => {
                                setNewPasswordConfirm(e.target.value);
                                setError('');
                            }}
                        />
                    </div>
                </div>

                {error && <p className="text-destructive -mt-2 mb-4 text-center">{error}</p>}
                <Button className="w-full" type="submit" disabled={isSaving}>
                    {isSaving
                        ? t('panel.common.saving')
                        : authData.isTempPassword
                          ? t('panel.account.password.save_next')
                          : t('panel.account.password.change_btn')}
                </Button>
            </form>
        </TabsContent>
    );
});

/**
 * Change Identifiers tab
 */
function ChangeIdentifiersTab() {
    const { t } = useLocale();
    const authedFetcher = useAuthedFetcher();
    const [state, dispatch] = useReducer(reduceChangeIdentifiersState, {
        cfxreId: '',
        discordId: '',
        error: '',
        isConvertingFivemId: false,
        isSaving: false,
    });
    const { cfxreId, discordId, error, isConvertingFivemId, isSaving } = state;
    const closeAccountModal = useCloseAccountModal();

    const currIdsResp = useSWR<ApiChangeIdentifiersReq>(
        '/auth/getIdentifiers',
        () => authedFetcher<ApiChangeIdentifiersReq>('/auth/getIdentifiers'),
        {
            //the data min interval is 5 mins, so we can safely cache for 1 min
            revalidateOnMount: true,
            revalidateOnFocus: false,
        },
    );

    useEffect(() => {
        if (!currIdsResp.data) return;
        dispatch({
            cfxreId: currIdsResp.data.cfxreId,
            discordId: currIdsResp.data.discordId,
        });
    }, [currIdsResp.data]);

    useEffect(() => {
        dispatch({ error: currIdsResp.error?.message ?? '' });
    }, [currIdsResp.error]);

    const changeIdentifiersApi = useBackendApi<GenericApiOkResp, ApiChangeIdentifiersReq>({
        method: 'POST',
        path: '/auth/changeIdentifiers',
    });

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        dispatch({ error: '', isSaving: true });
        changeIdentifiersApi({
            data: { cfxreId, discordId },
            error: (error) => {
                dispatch({ error, isSaving: false });
            },
            success: (data) => {
                if ('success' in data) {
                    txToast.success(t('panel.account.identifiers.success'));
                    closeAccountModal();
                } else {
                    dispatch({ error: data.error, isSaving: false });
                }
            },
        });
    };

    const handleCfxreIdBlur = async () => {
        if (!cfxreId) return;
        const trimmed = cfxreId.trim();
        if (/^\d+$/.test(trimmed)) {
            dispatch({ cfxreId: `fivem:${trimmed}` });
        } else if (!trimmed.startsWith('fivem:')) {
            try {
                dispatch({ isConvertingFivemId: true });
                const forumData = await fetchWithTimeout<{ user?: { id?: number } }>(
                    `https://forum.cfx.re/u/${trimmed}.json`,
                );
                if (forumData.user && typeof forumData.user.id === 'number') {
                    dispatch({ cfxreId: `fivem:${forumData.user.id}` });
                } else {
                    dispatch({ error: t('panel.account.identifiers.forum_not_found') });
                }
            } catch {
                dispatch({ error: t('panel.account.identifiers.forum_api_failed') });
            } finally {
                dispatch({ isConvertingFivemId: false });
            }
        } else if (cfxreId !== trimmed) {
            dispatch({ cfxreId: trimmed });
        }
    };

    const handleDiscordIdBlur = () => {
        if (!discordId) return;
        const trimmed = discordId.trim();
        if (/^\d+$/.test(trimmed)) {
            dispatch({ discordId: `discord:${trimmed}` });
        } else if (discordId !== trimmed) {
            dispatch({ discordId: trimmed });
        }
    };

    return (
        <TabsContent value="identifiers" tabIndex={undefined}>
            <form onSubmit={handleSubmit}>
                <p className="text-muted-foreground text-sm">
                    {t('panel.account.identifiers.description')} <br />
                    <strong>{t('panel.account.identifiers.recommended')}</strong>
                </p>
                <div className="space-y-3 pt-2 pb-6">
                    <div className="space-y-1">
                        <Label htmlFor="cfxreId">
                            {t('panel.account.identifiers.fivem_label')}{' '}
                            <span className="text-info text-sm opacity-75">({t('panel.common.optional')})</span>
                        </Label>
                        <Input
                            id="cfxreId"
                            autoCapitalize="none"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder={t('panel.account.identifiers.fivem_placeholder')}
                            value={
                                currIdsResp.isLoading || isConvertingFivemId
                                    ? t('panel.common.loading_ellipsis')
                                    : cfxreId
                            }
                            disabled={currIdsResp.isLoading || isConvertingFivemId}
                            onBlur={handleCfxreIdBlur}
                            onChange={(e) => {
                                dispatch({ cfxreId: e.target.value, error: '' });
                            }}
                        />
                        <p className="text-muted-foreground text-sm">
                            {t('panel.account.identifiers.fivem_help')} <br />
                            {t('panel.account.identifiers.fivem_forum')}{' '}
                            <TxAnchor href="https://forum.cfx.re/">forum.cfx.re</TxAnchor>. <br />
                            {t('panel.account.identifiers.fivem_required')}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="discordId">
                            {t('panel.account.identifiers.discord_label')}{' '}
                            <span className="text-info text-sm opacity-75">({t('panel.common.optional')})</span>
                        </Label>
                        <Input
                            id="discordId"
                            autoCapitalize="none"
                            autoComplete="off"
                            autoCorrect="off"
                            placeholder={t('panel.account.identifiers.discord_placeholder')}
                            value={currIdsResp.isLoading ? t('panel.common.loading_ellipsis') : discordId}
                            disabled={currIdsResp.isLoading}
                            onBlur={handleDiscordIdBlur}
                            onChange={(e) => {
                                dispatch({ discordId: e.target.value, error: '' });
                            }}
                        />
                        <p className="text-muted-foreground text-sm">
                            {t('panel.account.identifiers.discord_help')}{' '}
                            <TxAnchor href="https://support.discordapp.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID">
                                this guide
                            </TxAnchor>
                            . <br />
                            {t('panel.account.identifiers.discord_required')}
                        </p>
                    </div>
                </div>

                {error && <p className="text-destructive -mt-2 mb-4 text-center">{error}</p>}
                <Button className="w-full" type="submit" disabled={!currIdsResp || isSaving}>
                    {isSaving ? t('panel.common.saving') : t('panel.account.identifiers.save_btn')}
                </Button>
            </form>
        </TabsContent>
    );
}

/**
 * Two-Factor Authentication tab
 */
function TwoFactorTab() {
    const { t } = useLocale();
    const { authData, setAuthData } = useAuth();

    const [state, dispatch] = useReducer(reduceTwoFactorState, {
        step: 'status',
        setupSecret: '',
        qrDataUrl: '',
        verifyCode: '',
        backupCodes: [],
        disablePassword: '',
        disableCode: '',
        error: '',
        isProcessing: false,
    });
    const { step, setupSecret, qrDataUrl, verifyCode, backupCodes, disablePassword, disableCode, error, isProcessing } =
        state;

    const authedFetcher = useAuthedFetcher();
    const safeAuthData = authData && typeof authData === 'object' ? authData : null;

    const is2faEnabled = safeAuthData?.totpEnabled ?? false;

    const handleStartSetup = async () => {
        dispatch({ error: '', isProcessing: true });
        try {
            const data = await authedFetcher<ApiTotpSetupResp>('/auth/totp/setup', {
                method: 'POST',
            });
            if ('error' in data) {
                dispatch({ error: data.error });
            } else {
                let dataUrl = '';
                try {
                    dataUrl = await QRCode.toDataURL(data.uri, { width: 200, margin: 2 });
                } catch {
                    // QR generation failed - user can still manually enter
                }
                dispatch({
                    setupSecret: data.secret,
                    qrDataUrl: dataUrl,
                    step: 'setup',
                });
            }
        } catch {
            dispatch({ error: t('panel.account.two_factor.setup_failed') });
        } finally {
            dispatch({ isProcessing: false });
        }
    };

    const handleConfirmSetup = async () => {
        if (!verifyCode.trim()) return;
        dispatch({ error: '', isProcessing: true });
        try {
            const data = await authedFetcher<ApiTotpConfirmResp>('/auth/totp/confirm', {
                method: 'POST',
                body: { code: verifyCode.trim() },
            });
            if ('error' in data) {
                dispatch({ error: data.error });
            } else {
                dispatch({ backupCodes: data.backupCodes, step: 'backup' });
                setAuthData((prev) =>
                    prev
                        ? {
                              ...prev,
                              totpEnabled: true,
                          }
                        : prev,
                );
            }
        } catch {
            dispatch({ error: t('panel.account.two_factor.confirm_failed') });
        } finally {
            dispatch({ isProcessing: false });
        }
    };

    const handleDisable = async () => {
        if (!disablePassword || !disableCode.trim()) return;
        dispatch({ error: '', isProcessing: true });
        try {
            const data = await authedFetcher<ApiTotpDisableResp>('/auth/totp/disable', {
                method: 'POST',
                body: { password: disablePassword, code: disableCode.trim() },
            });
            if ('error' in data) {
                dispatch({ error: data.error });
            } else {
                setAuthData((prev) =>
                    prev
                        ? {
                              ...prev,
                              totpEnabled: false,
                          }
                        : prev,
                );
                dispatch({
                    step: 'status',
                    disablePassword: '',
                    disableCode: '',
                    error: '',
                });
                txToast.success(t('panel.account.two_factor.disabled_success'));
            }
        } catch {
            dispatch({ error: t('panel.account.two_factor.disable_failed') });
        } finally {
            dispatch({ isProcessing: false });
        }
    };

    const handleCopyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        txToast.success(t('panel.account.two_factor.backup_copied'));
    };

    if (!authData) return null;

    return (
        <TabsContent value="security" tabIndex={undefined}>
            {step === 'status' && (
                <>
                    {window.txConsts.requireAdminTwoFactor && !is2faEnabled && (
                        <p className="text-warning-inline mb-3 text-sm">
                            {t('panel.account.two_factor.required_warning')}
                        </p>
                    )}
                    <TwoFactorStatusStep
                        enabled={is2faEnabled}
                        error={error}
                        isProcessing={isProcessing}
                        canDisable={!window.txConsts.requireAdminTwoFactor}
                        onStartSetup={handleStartSetup}
                        onStartDisable={() => dispatch({ step: 'disable' })}
                    />
                </>
            )}

            {step === 'setup' && (
                <TwoFactorSetupStep
                    setupSecret={setupSecret}
                    qrDataUrl={qrDataUrl}
                    verifyCode={verifyCode}
                    error={error}
                    isProcessing={isProcessing}
                    onCodeChange={(verifyCode) => dispatch({ verifyCode, error: '' })}
                    onCancel={() => dispatch({ step: 'status', error: '' })}
                    onConfirm={handleConfirmSetup}
                />
            )}

            {step === 'backup' && (
                <TwoFactorBackupStep
                    backupCodes={backupCodes}
                    onCopy={handleCopyBackupCodes}
                    onFinish={() => {
                        dispatch({
                            step: 'status',
                            backupCodes: [],
                            verifyCode: '',
                            setupSecret: '',
                            qrDataUrl: '',
                        });
                    }}
                />
            )}

            {step === 'disable' && (
                <TwoFactorDisableStep
                    disablePassword={disablePassword}
                    disableCode={disableCode}
                    error={error}
                    isProcessing={isProcessing}
                    onPasswordChange={(disablePassword) => dispatch({ disablePassword, error: '' })}
                    onCodeChange={(disableCode) => dispatch({ disableCode, error: '' })}
                    onCancel={() => {
                        dispatch({
                            step: 'status',
                            error: '',
                            disablePassword: '',
                            disableCode: '',
                        });
                    }}
                    onDisable={handleDisable}
                />
            )}
        </TabsContent>
    );
}

/**
 * Account Dialog
 */
export default function AccountDialog() {
    const { t } = useLocale();
    const { authData } = useAuth();
    const { hasPerm } = useAdminPerms();
    const { isAccountModalOpen, setAccountModalOpen, accountModalTab, setAccountModalTab } = useAccountModal();

    useEffect(() => {
        if (!authData) return;
        if (authData.isTempPassword) {
            setAccountModalOpen(true);
            setAccountModalTab('password');
        }
    }, []);

    const mustEnableTwoFactor = Boolean(authData && window.txConsts.requireAdminTwoFactor && !authData.totpEnabled);

    const dialogSetIsClose = (newState: boolean) => {
        if (!newState && authData && (authData.isTempPassword || mustEnableTwoFactor)) {
            return;
        }
        if (!newState && authData) {
            setAccountModalOpen(false);
            setTimeout(() => {
                setAccountModalTab('password');
            }, 500);
        }
    };

    if (!authData) return;
    const canEditIdentifiers = window.txConsts.allowSelfIdentifierEdit || hasPerm('manage.admins');
    return (
        <Dialog open={isAccountModalOpen} onOpenChange={dialogSetIsClose}>
            <DialogContent className="sm:max-w-lg" tabIndex={undefined}>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">
                        {authData.isTempPassword
                            ? t('panel.account.welcome_title')
                            : t('panel.account.your_account', { name: authData.name })}
                    </DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="password" value={accountModalTab} onValueChange={setAccountModalTab}>
                    <TabsList className={`mb-4 grid w-full ${canEditIdentifiers ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        <TabsTrigger value="password">{t('panel.account.tabs.password')}</TabsTrigger>
                        {canEditIdentifiers && (
                            <TabsTrigger value="identifiers" disabled={authData.isTempPassword}>
                                {t('panel.account.tabs.identifiers')}
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="security" disabled={authData.isTempPassword}>
                            {mustEnableTwoFactor
                                ? t('panel.account.tabs.security_required')
                                : t('panel.account.tabs.security')}
                        </TabsTrigger>
                    </TabsList>
                    <ChangePasswordTab />
                    {canEditIdentifiers && <ChangeIdentifiersTab />}
                    <TwoFactorTab />
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
