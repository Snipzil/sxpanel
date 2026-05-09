import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { ApiOauthRedirectResp, ApiVerifyPasswordReq, ApiVerifyPasswordResp } from '@shared/authApiTypes';
import { useAuth } from '@/hooks/auth';
import { useLocation } from 'wouter';
import { fetchWithTimeout } from '@/hooks/fetch';
import { processFetchError } from './errors';
import { ServerGlowIcon } from '@/components/serverIcon';
import { FaDiscord } from 'react-icons/fa';

function MobileServerHeader() {
    const server = window.txConsts.server;
    if (!server?.name) return null;
    return (
        <div className="mb-6 flex items-center gap-3 xl:hidden">
            <ServerGlowIcon iconFilename={server.icon} serverName={server.name} gameName={server.game} />
            <div>
                <div className="text-base leading-tight font-semibold">{server.name}</div>
                <div className="text-muted-foreground text-xs">Sign in to continue</div>
            </div>
        </div>
    );
}

export enum LogoutReasonHash {
    NONE = '',
    LOGOUT = '#logout',
    EXPIRED = '#expired',
    UPDATED = '#updated',
    MASTER_ALREADY_SET = '#master_already_set',
    SHUTDOWN = '#shutdown',
}

export default function Login() {
    const { setAuthData } = useAuth();
    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [isFetching, setIsFetching] = useState(false);
    const [fetchingAction, setFetchingAction] = useState<'' | 'login' | 'discourse' | 'discord'>('');
    const setLocation = useLocation()[1];

    const onError = (error: any) => {
        const { errorTitle, errorMessage } = processFetchError(error);
        setErrorMessage(`${errorTitle}:\n${errorMessage}`);
    };

    const onErrorResponse = (error: string) => {
        if (error === 'no_admins_setup') {
            setErrorMessage('No admins set up.\nRedirecting...');
            setLocation('/addMaster/pin');
        } else {
            setErrorMessage(error);
        }
    };

    const handleLogin = async () => {
        try {
            setIsFetching(true);
            setFetchingAction('login');
            const data = await fetchWithTimeout<ApiVerifyPasswordResp, ApiVerifyPasswordReq>(
                `/auth/password?uiVersion=${encodeURIComponent(window.txConsts.txaVersion)}`,
                {
                    method: 'POST',
                    body: {
                        username: usernameRef.current?.value ?? '',
                        password: passwordRef.current?.value ?? '',
                    },
                },
            );
            if ('error' in data) {
                if (data.error === 'refreshToUpdate') {
                    window.location.href = `/login${LogoutReasonHash.UPDATED}`;
                    window.location.reload();
                } else {
                    onErrorResponse(data.error);
                }
            } else if ('totp_required' in data) {
                setLocation('/login/totp');
            } else {
                setAuthData(data);
            }
        } catch (error) {
            onError(error);
        } finally {
            setIsFetching(false);
            setFetchingAction('');
        }
    };

    const handleDiscourseRedirect = async () => {
        try {
            setIsFetching(true);
            setFetchingAction('discourse');
            const data = await fetchWithTimeout<ApiOauthRedirectResp>(
                `/auth/discourse/redirect?origin=${encodeURIComponent(window.location.origin)}`,
            );
            if ('error' in data) {
                onErrorResponse(data.error);
                setIsFetching(false);
                setFetchingAction('');
            } else {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            onError(error);
            setIsFetching(false);
            setFetchingAction('');
        }
    };

    const handleDiscordRedirect = async () => {
        try {
            setIsFetching(true);
            setFetchingAction('discord');
            const data = await fetchWithTimeout<ApiOauthRedirectResp>(
                `/auth/discord/redirect?origin=${encodeURIComponent(window.location.origin)}`,
            );
            if ('error' in data) {
                onErrorResponse(data.error);
                setIsFetching(false);
                setFetchingAction('');
            } else {
                window.location.href = data.authUrl;
            }
        } catch (error) {
            onError(error);
            setIsFetching(false);
            setFetchingAction('');
        }
    };

    //Prefill username/password if dev pass enabled
    useEffect(() => {
        try {
            const rawLocalStorageStr = localStorage.getItem('authCredsAutofill');
            if (rawLocalStorageStr) {
                const [user, pass] = JSON.parse(rawLocalStorageStr);
                if (usernameRef.current) usernameRef.current.value = user ?? '';
                if (passwordRef.current) passwordRef.current.value = pass ?? '';
            }
        } catch (error) {
            console.error('Username/Pass autofill failed', error);
        }
    }, []);

    //Gets the message from the hash and clears it
    useEffect(() => {
        const hash = window.location.hash;
        if (!hash) return;
        if (hash === LogoutReasonHash.LOGOUT) {
            setErrorMessage('Logged out.');
        } else if (hash === LogoutReasonHash.EXPIRED) {
            setErrorMessage('Session expired.');
        } else if (hash === LogoutReasonHash.UPDATED) {
            setErrorMessage('fxPanel updated — please sign in again.');
        } else if (hash === LogoutReasonHash.MASTER_ALREADY_SET) {
            setErrorMessage('Master account already configured.');
        } else if (hash === LogoutReasonHash.SHUTDOWN) {
            setErrorMessage('fxPanel server shut down.\nStart it again to sign in.');
        }
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }, []);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
            }}
            className="flex flex-col gap-5"
        >
            <MobileServerHeader />

            {/* Heading */}
            <div className="mb-1">
                <h1 className="text-foreground text-xl font-semibold">Sign in</h1>
                <p className="text-muted-foreground mt-0.5 text-sm">Enter your credentials to continue</p>
            </div>

            {/* Error */}
            {errorMessage && (
                <div className="border-destructive/30 bg-destructive/10 text-destructive-inline rounded-md border px-3 py-2.5 text-sm whitespace-pre-wrap">
                    {errorMessage}
                </div>
            )}

            {/* Fields */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="frm-login" className="text-foreground/80 text-sm font-medium">
                        Username
                    </Label>
                    <Input
                        id="frm-login"
                        ref={usernameRef}
                        type="text"
                        placeholder="your username"
                        autoCapitalize="off"
                        autoComplete="off"
                        className="bg-background/60 h-10"
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="frm-password" className="text-foreground/80 text-sm font-medium">
                        Password
                    </Label>
                    <Input
                        id="frm-password"
                        ref={passwordRef}
                        type="password"
                        placeholder="••••••••"
                        autoCapitalize="off"
                        autoComplete="off"
                        className="bg-background/60 h-10"
                        required
                    />
                </div>
            </div>

            {/* Primary sign in button */}
            <Button
                type="submit"
                className="bg-accent text-accent-foreground hover:bg-accent/90 h-10 w-full font-medium"
                disabled={isFetching}
            >
                {fetchingAction === 'login' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in
            </Button>

            {/* OAuth options */}
            <div className="relative flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <span className="text-muted-foreground/60 shrink-0 text-xs">or continue with</span>
                <div className="bg-border h-px flex-1" />
            </div>

            <div className="flex flex-col gap-2">
                <Button
                    className="border-border/60 bg-secondary/50 text-foreground hover:bg-secondary hover:text-foreground h-10 w-full font-normal"
                    variant="outline"
                    type="button"
                    disabled={isFetching}
                    onClick={handleDiscourseRedirect}
                >
                    {fetchingAction === 'discourse' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    <span className="mr-2 font-bold text-[#F40552]">cfx</span>
                    Cfx.re Account
                </Button>

                {window.txConsts.discordOAuthEnabled && (
                    <Button
                        className="border-border/60 bg-secondary/50 text-foreground hover:bg-secondary hover:text-foreground h-10 w-full font-normal"
                        variant="outline"
                        type="button"
                        disabled={isFetching}
                        onClick={handleDiscordRedirect}
                    >
                        {fetchingAction === 'discord' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <FaDiscord className="mr-2 h-4 w-4 text-[#5865F2]" />
                        )}
                        Discord
                    </Button>
                )}
            </div>
        </form>
    );
}
