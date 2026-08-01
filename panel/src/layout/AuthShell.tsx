import { Route, Switch, useLocation } from 'wouter';
import Login from '../pages/auth/Login';
import TotpVerify from '../pages/auth/TotpVerify';
import CfxreCallback from '../pages/auth/CfxreCallback';
import DiscordCallback from '../pages/auth/DiscordCallback';
import AddMasterPin from '../pages/auth/AddMasterPin';
import AddMasterCallback from '../pages/auth/AddMasterCallback';
import { LogoFullSquareGreen } from '@/components/Logos';
import { useThemedImage } from '@/hooks/theme';
import { handleExternalLinkClick } from '@/lib/navigation';
import { AuthError } from '@/pages/auth/errors';
import { ServerGlowIcon } from '@/components/serverIcon';
import { useShellViewportStyles } from '@/hooks/useShellViewportStyles';

function AuthContentWrapper({ children }: { children: React.ReactNode }) {
    return <div className="p-8 text-center">{children}</div>;
}

function AuthBackground() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {/* grid */}
            <div
                className="absolute inset-0 opacity-[0.035]"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                    backgroundSize: '48px 48px',
                }}
            />
            {/* accent glow, centered behind the card */}
            <div className="bg-accent/12 absolute top-1/2 left-1/2 size-144 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
            <div className="bg-accent/8 absolute -top-24 -left-24 size-72 rounded-full blur-3xl" />
            <div className="bg-accent/8 absolute -right-24 -bottom-24 size-72 rounded-full blur-3xl" />
        </div>
    );
}

function BrandHeader() {
    const [location] = useLocation();
    const isMasterSetup = location.startsWith('/addMaster');
    // During master-account setup the server is not yet configured (often shows
    // the default 'change-me' name), so always show the sxPanel brand instead.
    const server = isMasterSetup ? undefined : window?.txConsts?.server;
    const customLogoUrl = useThemedImage(window.txConsts.providerLogo);

    return (
        <div className="relative z-10 mb-8 flex flex-col items-center gap-4 text-center">
            {customLogoUrl ? (
                <img
                    className="max-h-14 max-w-48"
                    src={customLogoUrl}
                    alt={window.txConsts.providerName || 'Provider logo'}
                />
            ) : (
                <LogoFullSquareGreen className="w-40" />
            )}
            {server?.name && (
                <div className="flex items-center gap-3">
                    <ServerGlowIcon
                        iconFilename={server.icon}
                        iconDataUrl={server.iconDataUrl}
                        serverName={server.name}
                        gameName={server.game}
                    />
                    <div className="text-left">
                        <div className="text-foreground text-lg leading-tight font-semibold">{server.name}</div>
                        <div className="text-muted-foreground text-xs">Sign in to manage your server</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AuthFooter() {
    return (
        <div className="relative z-10 mt-8 flex flex-col items-center gap-2">
            <div className="text-muted-foreground/50 font-mono text-xs tracking-wide">
                sxP&nbsp;
                <span className="text-muted-foreground/80">v{window.txConsts?.txaVersion ?? 'unknown'}</span>
                <span className="mx-2 opacity-40">/</span>
                fxS&nbsp;
                <span className="text-muted-foreground/80">b{window.txConsts?.fxsVersion ?? 'unknown'}</span>
            </div>
            <a
                href="https://github.com/Snipzil/sxpanel/blob/main/LICENSE"
                onClick={handleExternalLinkClick}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/35 hover:text-muted-foreground/60 text-xs transition-colors"
            >
                &copy; 2026 snipz
            </a>
        </div>
    );
}

export default function AuthShell() {
    useShellViewportStyles();
    return (
        <div className="auth-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
            <AuthBackground />

            <div className="relative z-10 flex w-full flex-col items-center">
                <BrandHeader />

                <div className="border-border/40 bg-card/40 w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
                    <Switch>
                        <Route path="/login">
                            <Login />
                        </Route>
                        <Route path="/login/totp">
                            <TotpVerify />
                        </Route>
                        <Route path="/login/callback">
                            <AuthContentWrapper>
                                <CfxreCallback />
                            </AuthContentWrapper>
                        </Route>
                        <Route path="/login/discord/callback">
                            <AuthContentWrapper>
                                <DiscordCallback />
                            </AuthContentWrapper>
                        </Route>
                        <Route path="/addMaster/pin">
                            <AuthContentWrapper>
                                <AddMasterPin />
                            </AuthContentWrapper>
                        </Route>
                        <Route path="/addMaster/callback">
                            <AuthContentWrapper>
                                <AddMasterCallback />
                            </AuthContentWrapper>
                        </Route>
                        <Route path="/:fullPath*">
                            <AuthContentWrapper>
                                <AuthError
                                    error={{
                                        errorTitle: '404 | Not Found',
                                        errorMessage: 'Something went wrong.',
                                    }}
                                />
                            </AuthContentWrapper>
                        </Route>
                    </Switch>
                </div>

                <AuthFooter />
            </div>
        </div>
    );
}
