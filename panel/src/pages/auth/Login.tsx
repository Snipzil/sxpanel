import { useEffect, useState } from 'react';
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
import { DiscordIcon } from '@/components/icons/discord-icon';
import { useLocale } from '@/hooks/locale';
import { LogoutReasonHash } from '@/lib/logoutReasonHash';

export { LogoutReasonHash };

function readStoredCredentials() {
    try {
        const rawLocalStorageStr = localStorage.getItem('authCredsAutofill');
        if (!rawLocalStorageStr) {
            return { username: '', password: '' };
        }
        const [user, pass] = JSON.parse(rawLocalStorageStr);
        return {
            username: user ?? '',
            password: pass ?? '',
        };
    } catch (error) {
        console.error('Username/Pass autofill failed', error);
        return { username: '', password: '' };
    }
}

function readHashErrorMessage(t: ReturnType<typeof useLocale>['t']) {
    const hash = window.location.hash;
    if (hash === LogoutReasonHash.LOGOUT) {
        return t('panel.auth.login.logged_out');
    }
    if (hash === LogoutReasonHash.EXPIRED) {
        return t('panel.auth.login.session_expired');
    }
    if (hash === LogoutReasonHash.UPDATED) {
        return t('panel.auth.login.updated_relogin');
    }
    if (hash === LogoutReasonHash.MASTER_ALREADY_SET) {
        return t('panel.auth.login.master_already_set');
    }
    if (hash === LogoutReasonHash.SHUTDOWN) {
        return t('panel.auth.login.shutdown');
    }
    return undefined;
}

function MobileServerHeader() {
    const { t } = useLocale();
    const server = window.txConsts.server;
    if (!server?.name) return null;
    return (
        <div className="mb-6 flex items-center gap-3 xl:hidden">
            <ServerGlowIcon
                iconFilename={server.icon}
                iconDataUrl={server.iconDataUrl}
                serverName={server.name}
                gameName={server.game}
            />
            <div>
                <div className="text-base leading-tight font-semibold">{server.name}</div>
                <div className="text-muted-foreground text-xs">{t('panel.auth.login.continue_hint')}</div>
            </div>
        </div>
    );
}

export default function Login() {
    const { t } = useLocale();
    const { setAuthData } = useAuth();
    const [credentials, setCredentials] = useState(readStoredCredentials);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(() => readHashErrorMessage(t));
    const [isFetching, setIsFetching] = useState(false);
    const [fetchingAction, setFetchingAction] = useState<'' | 'login' | 'cfxre' | 'discord'>('');
    const setLocation = useLocation()[1];
    const { username, password } = credentials;

    const onError = (error: any) => {
        const { errorTitle, errorMessage } = processFetchError(error);
        setErrorMessage(`${errorTitle}:\n${errorMessage}`);
    };

    const onErrorResponse = (error: string) => {
        if (error === 'no_admins_setup') {
            setErrorMessage(t('panel.auth.login.no_admins'));
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
                        username,
                        password,
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

    const handleCfxreRedirect = async () => {
        try {
            setIsFetching(true);
            setFetchingAction('cfxre');
            const data = await fetchWithTimeout<ApiOauthRedirectResp>(
                `/auth/cfxre/redirect?origin=${encodeURIComponent(window.location.origin)}`,
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

    useEffect(() => {
        if (!window.location.hash) return;
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }, []);

    return (
        <form action={handleLogin} className="flex flex-col gap-5">
            <MobileServerHeader />

            {/* Heading */}
            <div className="mb-1">
                <h1 className="text-foreground text-xl font-semibold">{t('panel.auth.login.title')}</h1>
                <p className="text-muted-foreground mt-0.5 text-sm">{t('panel.auth.login.subtitle')}</p>
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
                        {t('panel.auth.login.username')}
                    </Label>
                    <Input
                        id="frm-login"
                        type="text"
                        placeholder={t('panel.auth.login.username_placeholder')}
                        autoCapitalize="off"
                        autoComplete="off"
                        className="bg-background/60 h-10"
                        value={username}
                        onChange={(e) =>
                            setCredentials((prev) => ({
                                ...prev,
                                username: e.target.value,
                            }))
                        }
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="frm-password" className="text-foreground/80 text-sm font-medium">
                        {t('panel.auth.login.password')}
                    </Label>
                    <Input
                        id="frm-password"
                        type="password"
                        placeholder="••••••••"
                        autoCapitalize="off"
                        autoComplete="off"
                        className="bg-background/60 h-10"
                        value={password}
                        onChange={(e) =>
                            setCredentials((prev) => ({
                                ...prev,
                                password: e.target.value,
                            }))
                        }
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
                {fetchingAction === 'login' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {t('panel.auth.login.sign_in')}
            </Button>

            {/* OAuth options */}
            <div className="relative flex items-center gap-3">
                <div className="bg-border h-px flex-1" />
                <span className="text-muted-foreground/60 shrink-0 text-xs">
                    {t('panel.auth.login.or_continue_with')}
                </span>
                <div className="bg-border h-px flex-1" />
            </div>

            <div className="flex flex-col gap-2">
                <Button
                    className="border-border/60 bg-secondary/50 text-foreground hover:bg-secondary hover:text-foreground h-10 w-full font-normal"
                    variant="outline"
                    type="button"
                    disabled={isFetching}
                    onClick={handleCfxreRedirect}
                >
                    {fetchingAction === 'cfxre' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    <span className="mr-2 font-bold text-[#F40552]">cfx</span>
                    {t('panel.auth.login.cfx_account')}
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
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <DiscordIcon className="mr-2 size-4 text-[#5865F2]" />
                        )}
                        {t('panel.auth.login.discord')}
                    </Button>
                )}
            </div>
        </form>
    );
}
