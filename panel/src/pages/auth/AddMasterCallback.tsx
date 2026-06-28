import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/auth';
import { Label } from '@radix-ui/react-label';
import {
    ApiAddMasterCallbackFivemData,
    ApiAddMasterCallbackResp,
    ApiAddMasterSaveReq,
    ApiAddMasterSaveResp,
    ApiOauthCallbackErrorResp,
    ReactAuthDataType,
} from '@shared/authApiTypes';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthError, processFetchError, type AuthErrorData } from './errors';
import GenericSpinner from '@/components/GenericSpinner';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import consts from '@shared/consts';
import { PASSWORD_POLICY_DESCRIPTION, validateAdminPassword } from '@shared/passwordPolicy';
import { fetchWithTimeout } from '@/hooks/fetch';
import { LogoFullSquareGreen } from '@/components/Logos';
import { useLocale } from '@/hooks/locale';

type RegisterFormState = {
    errorMessage: string | undefined;
    fullPageError: AuthErrorData | undefined;
    isSaving: boolean;
    pendingAuth: ReactAuthDataType | null;
    panelIn: boolean;
};

function reduceRegisterFormState(state: RegisterFormState, action: Partial<RegisterFormState>): RegisterFormState {
    return {
        ...state,
        ...action,
    };
}

function RegisterForm({ fivemId, fivemName, profilePicture }: ApiAddMasterCallbackFivemData) {
    const { t } = useLocale();
    const { setAuthData } = useAuth();

    const discordRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const password2Ref = useRef<HTMLInputElement>(null);
    const termsRef = useRef<typeof CheckboxPrimitive.Root>(null);
    const [state, dispatch] = useReducer(reduceRegisterFormState, {
        errorMessage: undefined,
        fullPageError: undefined,
        isSaving: false,
        pendingAuth: null,
        panelIn: false,
    });
    const { errorMessage, fullPageError, isSaving, pendingAuth, panelIn } = state;

    const addMasterSave = async (password: string, discordId: string | undefined) => {
        try {
            dispatch({ isSaving: true });
            const data = await fetchWithTimeout<ApiAddMasterSaveResp, ApiAddMasterSaveReq>(`/auth/addMaster/save`, {
                method: 'POST',
                body: { discordId, password },
            });
            if ('error' in data) {
                if (data.error === 'master_already_set') {
                    dispatch({ fullPageError: { errorCode: data.error } });
                } else if (data.error === 'invalid_session') {
                    dispatch({
                        fullPageError: {
                            errorCode: data.error,
                            returnTo: '/addMaster/pin',
                        },
                    });
                } else {
                    dispatch({ errorMessage: data.error });
                }
            } else {
                // Store the payload and start the slide-over animation.
                // setAuthData fires only after the panel finishes sliding.
                dispatch({ pendingAuth: data });
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => dispatch({ panelIn: true }));
                });
            }
        } catch (error) {
            const { errorTitle, errorMessage } = processFetchError(error);
            dispatch({ errorMessage: `${errorTitle}: ${errorMessage}` });
        } finally {
            dispatch({ isSaving: false });
        }
    };

    const handlePanelTransitionEnd = () => {
        if (!pendingAuth) return;
        // Tell the OnboardingOverlay to skip its own slide-in since the
        // screen is already covered by this panel.
        sessionStorage.setItem('fxp_onboarding_instant', '1');
        window.txConsts.hasMasterAccount = true;
        setAuthData(pendingAuth);
    };

    const handleSubmit = (event?: React.FormEvent<HTMLFormElement>) => {
        event?.preventDefault();
        dispatch({ errorMessage: undefined });

        //Clean and check discord id
        let discordId: string | undefined;
        let discordInput = discordRef.current?.value?.trim();
        if (typeof discordInput === 'string' && discordInput.length > 0) {
            if (discordInput.startsWith('discord:')) {
                discordInput = discordInput.substring(8);
                discordRef.current!.value = discordInput;
            }
            if (!consts.validIdentifierParts.discord.test(discordInput)) {
                dispatch({
                    errorMessage: t('panel.auth.add_master.callback.invalid_discord_id'),
                });
                return;
            }
            discordId = discordInput;
        }

        // @ts-ignore - Check terms
        if (termsRef.current?.value !== 'on') {
            dispatch({ errorMessage: t('panel.auth.add_master.callback.must_agree_terms') });
            return;
        }

        //Check passwords
        const password = passwordRef.current?.value || '';
        const password2 = password2Ref.current?.value || '';
        const policyResult = validateAdminPassword(password);
        if (!policyResult.ok) {
            dispatch({ errorMessage: policyResult.error });
            return;
        }
        if (password !== password2) {
            dispatch({ errorMessage: t('panel.auth.add_master.callback.passwords_mismatch') });
            return;
        }

        //Save!
        addMasterSave(password, discordId);
    };

    //Prefill password if dev pass enabled
    useEffect(() => {
        try {
            const rawLocalStorageStr = localStorage.getItem('authCredsAutofill');
            if (rawLocalStorageStr) {
                const [user, pass] = JSON.parse(rawLocalStorageStr);
                passwordRef.current!.value = pass ?? '';
                password2Ref.current!.value = pass ?? '';
            }
        } catch (error) {
            console.error('Passwords autofill failed', error);
        }
    }, []);

    if (fullPageError) {
        return <AuthError error={fullPageError} />;
    }

    return (
        <>
            <form onSubmit={handleSubmit} className="w-full text-left">
                <CardContent className="flex flex-col gap-4 pt-6">
                    <div>
                        {t('panel.auth.add_master.callback.cfx_account')}
                        <div className="mt-2 flex flex-row items-center justify-start rounded-md border bg-zinc-900 p-2">
                            <Avatar className="size-16 text-3xl" username={fivemName} profilePicture={profilePicture} />
                            <div className="ml-4 overflow-hidden text-left text-ellipsis">
                                <span className="text-2xl">{fivemName}</span> <br />
                                <code className="text-muted-foreground">{fivemId}</code>
                            </div>
                        </div>
                    </div>
                    {/* This is so password managers save the username */}
                    <input type="text" name="frm-username" className="hidden" value={fivemName} readOnly />
                    <div className="grid gap-2">
                        <div className="flex flex-row items-center justify-between">
                            <Label htmlFor="frm-discord">{t('panel.auth.add_master.callback.discord_id')}</Label>
                            <span className="text-muted-foreground text-xs">
                                {t('panel.auth.add_master.callback.discord_id_optional')}
                            </span>
                        </div>
                        <Input
                            className="placeholder:text-zinc-800"
                            id="frm-discord"
                            type="text"
                            ref={discordRef}
                            placeholder="000000000000000000"
                            disabled={isSaving}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex flex-row items-center justify-between">
                            <Label htmlFor="frm-password">{t('panel.auth.add_master.callback.backup_password')}</Label>
                            <span className="text-muted-foreground text-xs">
                                {t('panel.auth.add_master.callback.password_requirements')}
                            </span>
                        </div>
                        <Input
                            className="placeholder:text-zinc-800"
                            id="frm-password"
                            type="password"
                            ref={passwordRef}
                            placeholder="password"
                            disabled={isSaving}
                            required
                        />
                    </div>
                    <p className="text-muted-foreground text-xs">{PASSWORD_POLICY_DESCRIPTION}</p>
                    <div className="grid gap-2">
                        <Label htmlFor="frm-password2">{t('panel.auth.add_master.callback.confirm_password')}</Label>
                        <Input
                            className="placeholder:text-zinc-800"
                            id="frm-password2"
                            type="password"
                            ref={password2Ref}
                            placeholder="password"
                            disabled={isSaving}
                            required
                        />
                    </div>
                    <div className="mt-2 flex items-center gap-x-2">
                        {/* @ts-ignore */}
                        <Checkbox id="terms" ref={termsRef} required />
                        <label
                            htmlFor="terms"
                            className="text-sm leading-4 font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            {t('panel.auth.add_master.callback.terms_prefix')}{' '}
                            <a
                                href="https://fivem.net/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                {t('panel.auth.add_master.callback.terms_creator_pla')}
                            </a>{' '}
                            {t('panel.auth.add_master.callback.terms_and')}{' '}
                            <a
                                href="https://github.com/Snipzil/sxpanel/blob/master/LICENSE"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                {t('panel.auth.add_master.callback.terms_sxpanel_license')}
                            </a>
                            .
                        </label>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <span className="text-destructive text-center whitespace-pre-wrap">{errorMessage}</span>
                    <Button className="w-full" disabled={isSaving || !!pendingAuth}>
                        {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
                        {t('panel.auth.add_master.callback.register')}
                    </Button>
                </CardFooter>
            </form>

            {/* Transition panel — slides over the whole screen after registration
            succeeds. Once settled, we switch to MainShell / the setup flow. */}
            {pendingAuth && <div className="bg-background fixed inset-0 z-[200]" />}
            {pendingAuth && (
                <div
                    className="bg-card fixed inset-0 z-[201] flex min-h-screen w-full flex-col overflow-hidden"
                    style={{
                        transform: panelIn ? 'translateX(0%)' : 'translateX(100%)',
                        transition: 'transform 500ms cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '-32px 0 80px rgba(0,0,0,0.45)',
                    }}
                    onTransitionEnd={handlePanelTransitionEnd}
                >
                    <div className="border-border/40 flex shrink-0 items-center gap-3 border-b px-6 py-4">
                        <LogoFullSquareGreen className="h-8 w-auto opacity-90" />
                        <span className="text-muted-foreground text-xs tracking-wide uppercase">
                            {t('panel.auth.add_master.callback.first_time_setup')}
                        </span>
                    </div>
                </div>
            )}
        </>
    );
}

export default function AddMasterCallback() {
    const { t } = useLocale();
    const hasPendingMutation = useRef(false); //due to strict mode re-rendering
    const [fivemData, setFivemData] = useState<ApiAddMasterCallbackFivemData | undefined>();
    const [errorData, setErrorData] = useState<ApiOauthCallbackErrorResp | undefined>();
    const [isFetching, setIsFetching] = useState(false);

    const submitCallback = async () => {
        try {
            setIsFetching(true);
            const params = new URLSearchParams(window.location.search);
            const payload = params.get('payload');
            if (!payload) {
                setErrorData({
                    errorTitle: t('panel.auth.add_master.callback.missing_payload_title'),
                    errorMessage: t('panel.auth.add_master.callback.missing_payload_message'),
                });
                return;
            }
            const data = await fetchWithTimeout<ApiAddMasterCallbackResp>(`/auth/addMaster/callback`, {
                method: 'POST',
                body: { payload },
            });
            if ('errorCode' in data || 'errorTitle' in data) {
                setErrorData(data);
            } else {
                setFivemData(data);
            }
        } catch (error) {
            setErrorData(processFetchError(error));
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (fivemData || hasPendingMutation.current) return;
        hasPendingMutation.current = true;
        submitCallback();
    }, []);

    return fivemData ? (
        <RegisterForm {...fivemData} />
    ) : errorData ? (
        <AuthError error={{ ...errorData, returnTo: '/addMaster/pin' }} />
    ) : isFetching ? (
        <GenericSpinner msg={t('panel.auth.add_master.callback.authenticating')} />
    ) : (
        <GenericSpinner />
    );
}
