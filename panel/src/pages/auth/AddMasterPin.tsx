import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ApiAddMasterPinReq, ApiAddMasterPinResp } from '@shared/authApiTypes';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LogoutReasonHash } from './Login';
import { fetchWithTimeout } from '@/hooks/fetch';
import { AuthError, processFetchError, type AuthErrorData } from './errors';

const getSafeRedirectPath = (value: string) => {
    try {
        const parsed = new URL(value, window.location.origin);
        if (parsed.origin !== window.location.origin) return null;
        if (!parsed.pathname.startsWith('/')) return null;
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return null;
    }
};

export default function AddMasterPin() {
    const pinRef = useRef<HTMLInputElement>(null);
    const [isRedirecting, setIsRedirecting] = useState(false);
    const [messageText, setMessageText] = useState<string | undefined>();
    const [isMessageError, setIsMessageError] = useState<boolean>(false);
    const [isFetching, setIsFetching] = useState(false);
    const [fullPageError, setFullPageError] = useState<AuthErrorData | undefined>();

    const submitPin = async () => {
        try {
            setIsMessageError(false);
            setMessageText(undefined);
            setIsFetching(true);
            const data = await fetchWithTimeout<ApiAddMasterPinResp, ApiAddMasterPinReq>(`/auth/addMaster/pin`, {
                method: 'POST',
                body: {
                    pin: pinRef.current?.value || '000000',
                    origin: window.location.origin,
                },
            });
            if ('error' in data) {
                if (data.error === 'master_already_set') {
                    setIsRedirecting(true);
                    setFullPageError({ errorCode: data.error });
                } else {
                    setIsMessageError(true);
                    setMessageText(data.error);
                }
            } else {
                setIsRedirecting(true);
                const safeRedirectPath = getSafeRedirectPath(data.authUrl);
                if (!safeRedirectPath) {
                    setIsRedirecting(false);
                    setIsMessageError(true);
                    setMessageText('Invalid redirect URL.');
                    return;
                }
                console.log('Redirecting to', safeRedirectPath);
                window.location.assign(safeRedirectPath);
            }
        } catch (error) {
            setIsMessageError(true);
            const { errorTitle, errorMessage } = processFetchError(error);
            setMessageText(`${errorTitle}: ${errorMessage}`);
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (/^#\d{6}$/.test(window.location.hash)) {
            setMessageText('Auto-filled ✔');
            pinRef.current!.value = window.location.hash.substring(1);
        }
    }, []);

    if (fullPageError) {
        return <AuthError error={fullPageError} />;
    }

    const disableInput = isFetching || isRedirecting;
    return (
        <form
            onSubmit={(e) => {
                e?.preventDefault();
                submitPin();
            }}
            className="w-full"
        >
            <CardHeader className="space-y-1">
                <CardTitle className="text-3xl">No Cfx.re account linked</CardTitle>
                <CardDescription className="text-muted-foreground text-base">
                    Type in the PIN from the terminal.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
                <span className={cn('text-center', isMessageError ? 'text-destructive' : 'text-success')}>
                    {messageText ?? <>&nbsp;</>}
                </span>
                <Input
                    className={cn(
                        'p-2 text-center font-mono text-2xl tracking-[0.25em]',
                        messageText &&
                            (isMessageError
                                ? 'border-acctext-destructive text-destructive'
                                : 'border-succtext-success text-success'),
                    )}
                    id="frm-pin"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    ref={pinRef}
                    minLength={6}
                    maxLength={6}
                    placeholder="000000"
                    autoComplete="off"
                    onFocus={(e) => {
                        setIsMessageError(false);
                        setMessageText(undefined);
                        e.target?.select();
                    }}
                    onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '');
                        if (digitsOnly !== e.target.value) {
                            e.target.value = digitsOnly;
                        }
                        if (digitsOnly.length === 6) {
                            submitPin();
                        }
                    }}
                    disabled={disableInput}
                    required
                />
            </CardContent>
            <CardFooter>
                <Button className="w-full" disabled={disableInput}>
                    {disableInput && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Link Account
                </Button>
            </CardFooter>
        </form>
    );
}
