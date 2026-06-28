import InlineCode from '@/components/InlineCode';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import { ApiOauthCallbackErrorResp } from '@shared/authApiTypes';
import { ArrowLeftIcon } from 'lucide-react';
import { Link } from 'wouter';

//Shortcut component
function ErrorText({ children }: { children: React.ReactNode }) {
    return <p className="text-secondary-foreground pb-2 leading-relaxed whitespace-pre-wrap">{children}</p>;
}

export type AuthErrorData = ApiOauthCallbackErrorResp & { returnTo?: string };
type AuthErrorProps = {
    error: AuthErrorData;
};

/**
 * Display OAuth errors in a user-friendly way.
 */
export function AuthError({ error }: AuthErrorProps) {
    const returnTo = error.returnTo ?? '/login';
    let titleNode: React.ReactNode = null;
    let bodyNode: React.ReactNode = null;
    if ('errorTitle' in error) {
        titleNode = error.errorTitle;
        bodyNode = <ErrorText>{error.errorMessage}</ErrorText>;
    } else if (error.errorCode === 'invalid_session') {
        titleNode = 'Invalid Browser Session.';
        bodyNode = (
            <ErrorText>
                You may have restarted sxPanel right before entering this page. <br />
                Please return and try again.
            </ErrorText>
        );
    } else if (error.errorCode === 'clock_desync') {
        titleNode = 'Please Update/Synchronize your VPS clock.';
        bodyNode = (
            <ErrorText>
                Failed to login because this host's time is wrong. Please make sure to synchronize it with the internet.
            </ErrorText>
        );
    } else if (error.errorCode === 'timeout') {
        titleNode = 'Connection to FiveM servers timed out.';
        bodyNode = <ErrorText>Please try again or login using your existing username and backup password.</ErrorText>;
    } else if (error.errorCode === 'end_user_aborted') {
        titleNode = 'Login Aborted';
        bodyNode = (
            <ErrorText>
                The Cfx.re login process was aborted. <br />
                Return to the login page to try again.
            </ErrorText>
        );
    } else if (error.errorCode === 'end_user_logout') {
        titleNode = 'Login Aborted';
        bodyNode = (
            <ErrorText>
                The Cfx.re login process was aborted because you logged out of the Cfx.re account. <br />
                Return to the login page to try again.
            </ErrorText>
        );
    } else if (error.errorCode === 'master_already_set') {
        titleNode = 'Master Account Already Set';
        bodyNode = (
            <ErrorText>
                Please go back to the login page to continue. <br />
            </ErrorText>
        );
    } else if (error.errorCode === 'not_admin') {
        const fivemId = error.errorContext?.identifier ?? 'unknown';
        const fivemName = error.errorContext?.name ?? 'unknown';
        titleNode = `The Cfx.re account '${fivemName}' is not an admin.`;
        bodyNode = (
            <ErrorText>
                The account above with identifier <InlineCode>{fivemId}</InlineCode> is not assigned to any account
                registered on sxPanel. <br />
                You can also try to login using your username and backup password.
            </ErrorText>
        );
    } else {
        titleNode = 'Unknown Error:';
        bodyNode = (
            <div className="text-muted-foreground bg-muted rounded-sm p-1 text-left">
                <pre className="text-left whitespace-pre-wrap">{JSON.stringify(error, null, 2)}</pre>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h3 className="text-destructive-inline mb-4 text-2xl font-semibold">{titleNode}</h3>
            {bodyNode}
            <CardFooter className="mt-4 flex w-full justify-center pb-0">
                <Link href={returnTo} asChild>
                    <Button>
                        <ArrowLeftIcon className="mr-2 inline size-4" />
                        Try Again
                    </Button>
                </Link>
            </CardFooter>
        </div>
    );
}

/**
 * Check the URL search params for common OAuth errors and return them.
 */
export function getCommonOauthCallbackError(): AuthErrorData | undefined {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    const errorDescription = params.get('error_description');
    if (errorCode === 'access_denied' && errorDescription === 'End-User aborted interaction') {
        return { errorCode: 'end_user_aborted', returnTo: '/login' };
    }
    if (errorCode === 'access_denied' && errorDescription === 'End-User aborted interaction (logout)') {
        return { errorCode: 'end_user_logout', returnTo: '/login' };
    }
    return undefined;
}

/**
 * Process fetch errors and return a common error object.
 */
export const processFetchError = (error: any) => {
    if (error.message?.startsWith('NetworkError')) {
        return {
            errorTitle: 'Network Error',
            errorMessage: 'If you closed sxPanel, please restart it and try again.',
        };
    } else {
        return {
            errorTitle: 'Unknown Error',
            errorMessage: error.message ?? '😵',
        };
    }
};
