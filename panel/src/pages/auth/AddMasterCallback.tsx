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
} from '@shared/authApiTypes';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthError, processFetchError, type AuthErrorData } from './errors';
import GenericSpinner from '@/components/GenericSpinner';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import consts from '@shared/consts';
import { fetchWithTimeout } from '@/hooks/fetch';
import { LogoutReasonHash } from './Login';
import { LogoFullSquareGreen } from '@/components/Logos';

function RegisterForm({ fivemId, fivemName, profilePicture }: ApiAddMasterCallbackFivemData) {
    const { setAuthData } = useAuth();

    const discordRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const password2Ref = useRef<HTMLInputElement>(null);
    const termsRef = useRef<typeof CheckboxPrimitive.Root>(null);
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [fullPageError, setFullPageError] = useState<AuthErrorData | undefined>();
    const [isSaving, setIsSaving] = useState(false);

    // Holds the auth payload while the transition animation plays.
    // setAuthData is only called once the panel has fully slid over so the
    // tree switch (AuthShell → MainShell) happens after the animation ends.
    const [pendingAuth, setPendingAuth] = useState<ApiAddMasterSaveResp | null>(null);
    const [panelIn, setPanelIn] = useState(false);

    const addMasterSave = async (password: string, discordId: string | undefined) => {
        try {
            setIsSaving(true);
            const data = await fetchWithTimeout<ApiAddMasterSaveResp, ApiAddMasterSaveReq>(`/auth/addMaster/save`, {
                method: 'POST',
                body: { discordId, password },
            });
            if ('error' in data) {
                if (data.error === 'master_already_set') {
                    setFullPageError({ errorCode: data.error });
                } else if (data.error === 'invalid_session') {
                    setFullPageError({
                        errorCode: data.error,
                        returnTo: '/addMaster/pin',
                    });
                } else {
                    setErrorMessage(data.error);
                }
            } else {
                // Store the payload and start the slide-over animation.
                // setAuthData fires only after the panel finishes sliding.
                setPendingAuth(data);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setPanelIn(true));
                });
            }
        } catch (error) {
            const { errorTitle, errorMessage } = processFetchError(error);
            setErrorMessage(`${errorTitle}: ${errorMessage}`);
        } finally {
            setIsSaving(false);
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
        setErrorMessage(undefined);

        //Clean and check discord id
        let discordId: string | undefined;
        let discordInput = discordRef.current?.value?.trim();
        if (typeof discordInput === 'string' && discordInput.length > 0) {
            if (discordInput.startsWith('discord:')) {
                discordInput = discordInput.substring(8);
                discordRef.current!.value = discordInput;
            }
            if (!consts.validIdentifierParts.discord.test(discordInput)) {
                setErrorMessage(
                    'The Discord ID needs to be the numeric "User ID" instead of the username.\n You can also leave it blank.',
                );
                return;
            }
            discordId = discordInput;
        }

        // @ts-ignore - Check terms
        if (termsRef.current?.value !== 'on') {
            setErrorMessage('You MUST agree to the terms.');
            return;
        }

        //Check passwords
        const password = passwordRef.current?.value || '';
        const password2 = password2Ref.current?.value || '';
        if (password.length < consts.adminPasswordMinLength || password.length > consts.adminPasswordMaxLength) {
            setErrorMessage(
                `The password must be between ${consts.adminPasswordMinLength} and ${consts.adminPasswordMaxLength} characters long.`,
            );
            return;
        } else if (password !== password2) {
            setErrorMessage('The passwords do not match.');
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
                        Cfx.re account
                        <div className="mt-2 flex flex-row items-center justify-start rounded-md border bg-zinc-900 p-2">
                            <Avatar
                                className="h-16 w-16 text-3xl"
                                username={fivemName}
                                profilePicture={profilePicture}
                            />
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
                            <Label htmlFor="frm-discord">Discord ID</Label>
                            <span className="text-muted-foreground text-xs">(optional)</span>
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
                            <Label htmlFor="frm-password">Backup Password</Label>
                            <span className="text-muted-foreground text-xs">
                                ({consts.adminPasswordMinLength}~{consts.adminPasswordMaxLength} digits)
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
                    <div className="grid gap-2">
                        <Label htmlFor="frm-password2">Confirm Password</Label>
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
                    <div className="mt-2 flex items-center space-x-2">
                        {/* @ts-ignore */}
                        <Checkbox id="terms" ref={termsRef} required />
                        <label
                            htmlFor="terms"
                            className="text-sm leading-4 font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                            I have read and agree to the{' '}
                            <a
                                href="https://fivem.net/terms"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                Creator PLA
                            </a>{' '}
                            as well as the{' '}
                            <a
                                href="https://github.com/someaussiegaymer/fxPanel/blob/master/LICENSE"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                fxPanel License
                            </a>
                            .
                        </label>
                    </div>
                </CardContent>
                <CardFooter className="flex-col gap-2">
                    <span className="text-destructive text-center whitespace-pre-wrap">{errorMessage}</span>
                    <Button className="w-full" disabled={isSaving || !!pendingAuth}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Register
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
                        <span className="text-muted-foreground text-xs tracking-wide uppercase">First-time setup</span>
                    </div>
                </div>
            )}
        </>
    );
}

export default function AddMasterCallback() {
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
                    errorTitle: 'Missing payload',
                    errorMessage: 'The Discourse callback did not include the expected payload parameter.',
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

    if (fivemData) {
        return <RegisterForm {...fivemData} />;
    } else if (errorData) {
        return <AuthError error={{ ...errorData, returnTo: '/addMaster/pin' }} />;
    } else if (isFetching) {
        return <GenericSpinner msg="Authenticating..." />;
    } else {
        return <GenericSpinner />;
    }
}
