import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ShieldCheckIcon } from 'lucide-react';
import { ApiTotpVerifyResp } from '@shared/authApiTypes';
import { useAuth } from '@/hooks/auth';
import { useLocation } from 'wouter';
import { fetchWithTimeout } from '@/hooks/fetch';

export default function TotpVerify() {
    const { setAuthData } = useAuth();
    const codeRef = useRef<HTMLInputElement>(null);
    const [code, setCode] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | undefined>();
    const [isFetching, setIsFetching] = useState(false);
    const setLocation = useLocation()[1];

    useEffect(() => {
        codeRef.current?.focus();
    }, []);

    const handleVerify = async () => {
        const trimmedCode = code.trim();
        if (!trimmedCode) return;

        try {
            setIsFetching(true);
            const data = await fetchWithTimeout<ApiTotpVerifyResp>('/auth/totp/verify', {
                method: 'POST',
                body: { code: trimmedCode },
            });
            if ('error' in data) {
                setErrorMessage(data.error);
            } else {
                setAuthData(data);
            }
        } catch {
            setErrorMessage('Failed to verify code. Please try again.');
        } finally {
            setIsFetching(false);
        }
    };

    const handleCancel = () => {
        setLocation('/login');
    };

    return (
        <form action={handleVerify} className="w-full rounded-[inherit]">
            <CardHeader className="rounded-t-[inherit]">
                <CardTitle className="flex flex-col items-center gap-2 text-center">
                    <ShieldCheckIcon className="text-primary size-8" />
                    <span className="text-xl font-semibold">Two-Factor Authentication</span>
                </CardTitle>
            </CardHeader>
            <CardContent className="bg-card flex flex-col gap-4 rounded-b-[inherit] border-t pt-4">
                <p className="text-muted-foreground text-center text-sm">
                    Enter the 6-digit code from your authenticator app, or use a backup code.
                </p>

                {errorMessage && (
                    <div className="text-destructive-inline text-center text-sm whitespace-pre-wrap">
                        {errorMessage}
                    </div>
                )}

                <div className="space-y-2">
                    <Label htmlFor="totp-code">Code</Label>
                    <Input
                        id="totp-code"
                        ref={codeRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="000000"
                        autoCapitalize="off"
                        autoComplete="one-time-code"
                        maxLength={32}
                        required
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value);
                            setErrorMessage(undefined);
                        }}
                    />
                </div>

                <Button variant="outline" disabled={isFetching}>
                    {isFetching ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                        <ShieldCheckIcon className="mr-2 inline size-4" />
                    )}{' '}
                    Verify
                </Button>
                <Button type="button" variant="ghost" className="text-muted-foreground text-sm" onClick={handleCancel}>
                    Back to login
                </Button>
            </CardContent>
        </form>
    );
}
