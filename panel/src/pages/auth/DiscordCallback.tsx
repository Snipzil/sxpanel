import { useAuth } from '@/hooks/auth';
import { ApiOauthCallbackErrorResp, ApiOauthCallbackResp } from '@shared/authApiTypes';
import { useEffect, useRef, useState } from 'react';
import { AuthError, getCommonOauthCallbackError, processFetchError } from './errors';
import GenericSpinner from '@/components/GenericSpinner';
import { fetchWithTimeout } from '@/hooks/fetch';

export default function DiscordCallback() {
    const hasPendingMutation = useRef(false);
    const { authData, setAuthData } = useAuth();
    const [errorData, setErrorData] = useState<ApiOauthCallbackErrorResp | undefined>();
    const [isFetching, setIsFetching] = useState(false);

    const submitCallback = async () => {
        try {
            setIsFetching(true);
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const state = params.get('state');
            if (!code || !state) {
                setErrorData({
                    errorTitle: 'Missing parameters',
                    errorMessage: 'The Discord callback did not include the expected code and state parameters.',
                });
                return;
            }
            const data = await fetchWithTimeout<ApiOauthCallbackResp>('/auth/discord/callback', {
                method: 'POST',
                body: { code, state },
            });
            if ('errorCode' in data || 'errorTitle' in data) {
                setErrorData(data);
            } else {
                setAuthData(data);
            }
        } catch (error) {
            setErrorData(processFetchError(error));
        } finally {
            setIsFetching(false);
        }
    };

    useEffect(() => {
        if (authData || hasPendingMutation.current) return;
        hasPendingMutation.current = true;

        const oauthError = getCommonOauthCallbackError();
        if (oauthError) {
            setErrorData(oauthError);
            return;
        }

        submitCallback();
    }, []);

    return errorData ? (
        <AuthError error={errorData} />
    ) : isFetching ? (
        <GenericSpinner msg="Logging in..." />
    ) : (
        <GenericSpinner />
    );
}
