// FiveM CEF compatibility layer — must load before app code
import { installPanelCefCompat } from './cef-compat';
installPanelCefCompat();

// Required for the core webserver integration to work
import 'vite/modulepreload-polyfill';

import { ErrorBoundary } from 'react-error-boundary';
import ReactDOM from 'react-dom/client';
import './globals.css';

import { AppErrorFallback } from './components/ErrorFallback.tsx';
import { logoutWatcher, useIsAuthenticated } from './hooks/auth.ts';
import { buildLoginRedirectPath, isValidRedirectPath } from '@/lib/navigation';
import { installNuiEmbedKeyBridge, installNuiEmbedViewport, isEmbeddedInNuiMenu } from '@/lib/nuiEmbed';
import ThemeProvider from './components/ThemeProvider.tsx';
import { lazy, StrictMode, Suspense } from 'react';
import { isMobile } from 'is-mobile';
import { useAtomValue } from 'jotai';
import { pageTitleWatcher } from './hooks/pages.ts';
import { Redirect, useLocation } from 'wouter';
import GenericSpinner from '@/components/GenericSpinner';

const AuthShell = lazy(() => import('./layout/AuthShell.tsx'));
const AuthenticatedShell = lazy(() => import('./layout/MainShell.tsx'));

//If inside NUI, silence console.* calls to prevent confusion.
if (!window.txConsts.isWebInterface) {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    console.error = () => {};
    console.debug = () => {};
    console.table = () => {};
    console.group = () => {};
    console.groupEnd = () => {};
    console.groupCollapsed = () => {};
    console.time = () => {};
    console.timeEnd = () => {};
    console.timeLog = () => {};
}

//If embedded in the in-game menu iframe, fix viewport sizing and forward Tab/Escape
if (isEmbeddedInNuiMenu()) {
    installNuiEmbedViewport();
    installNuiEmbedKeyBridge();
}

//Detecting if the user is on a mobile device
try {
    window.txIsMobile = isMobile({ tablet: true });
} catch (error) {
    window.txIsMobile = false;
}

//Detecting locale preferences
try {
    window.txBrowserLocale = window?.nuiSystemLanguages ?? navigator.language ?? 'en';
} catch (error) {
    window.txBrowserLocale = 'en';
}
try {
    const localeOption = Intl.DateTimeFormat(window.txBrowserLocale, { hour: 'numeric' }).resolvedOptions().hour12;
    window.txBrowserHour12 = localeOption ?? true;
} catch (error) {
    window.txBrowserHour12 = true;
}

//If the initial routing is from WebPipe, remove it from the pathname so the router can handle it
if (window.location.pathname.substring(0, 8) === '/WebPipe') {
    console.info('Removing WebPipe prefix from the pathname.');
    const newUrl = window.location.pathname.substring(8) + window.location.search + window.location.hash;
    window.history.replaceState(null, '', newUrl);
}

//Rendering auth or main pages depending on if the user is authenticated
const authRoutePrefixes = ['/login', '/addMaster'];
const isAuthRoute = (pathname: string) => {
    return authRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
};

export function AuthContextSwitch() {
    useAtomValue(logoutWatcher);
    useAtomValue(pageTitleWatcher);
    const isAuthenticated = useIsAuthenticated();
    // Subscribe to wouter location so we re-render after <Redirect> updates the URL
    // (reading window.location alone does not trigger an update, which left a blank screen after login).
    const [pathname] = useLocation();
    const redirectPath = new URLSearchParams(window.location.search).get('r');

    if (isAuthenticated) {
        if (redirectPath) {
            return <Redirect to={isValidRedirectPath(redirectPath) ? redirectPath : '/'} replace />;
        }
        if (isAuthRoute(pathname)) {
            return <Redirect to="/" replace />;
        }
    } else {
        if (!window.txConsts.hasMasterAccount && !pathname.startsWith('/addMaster')) {
            console.log('No master account detected. Redirecting to addMaster page.');
            return <Redirect to="/addMaster/pin" replace />;
        }
        if (!isAuthRoute(pathname)) {
            console.log('User is not authenticated. Redirecting to login page.');
            return <Redirect to={buildLoginRedirectPath()} replace />;
        }
    }

    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center">
                    <GenericSpinner />
                </div>
            }
        >
            {isAuthenticated ? <AuthenticatedShell /> : <AuthShell />}
        </Suspense>
    );
}

type AppRootWindow = Window & {
    txReactRoot?: ReturnType<typeof ReactDOM.createRoot>;
};

const rootContainer = document.getElementById('root');

if (!rootContainer) {
    throw new Error('Root container #root not found');
}

const rootWindow = window as AppRootWindow;
const root = rootWindow.txReactRoot ?? ReactDOM.createRoot(rootContainer);
rootWindow.txReactRoot = root;

root.render(
    <StrictMode>
        <ErrorBoundary FallbackComponent={AppErrorFallback}>
            <ThemeProvider>
                <AuthContextSwitch />
            </ThemeProvider>
        </ErrorBoundary>
    </StrictMode>,
);
