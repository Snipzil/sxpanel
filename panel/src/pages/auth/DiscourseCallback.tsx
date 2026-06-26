import { useAuth } from '@/hooks/auth';
import { ApiOauthCallbackErrorResp, ApiOauthCallbackResp } from '@shared/authApiTypes';
import { useEffect, useRef, useState } from 'react';
import { AuthError, getCommonOauthCallbackError, processFetchError } from './errors';
import GenericSpinner from '@/components/GenericSpinner';
import { fetchWithTimeout } from '@/hooks/fetch';

export default function DiscourseCallback() {
    const hasPendingMutation = useRef(false);
    const { authData, setAuthData } = useAuth();
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
            const data = await fetchWithTimeout<ApiOauthCallbackResp>('/auth/discourse/callback', {
                method: 'POST',
                body: { payload },
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
