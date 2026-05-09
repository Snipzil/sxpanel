import { ErrorBoundary } from 'react-error-boundary';
import type { ReactElement } from 'react';
import { Route as WouterRoute, Switch } from 'wouter';
import { PageErrorFallback } from '@/components/ErrorFallback';
import { useAtomValue, useSetAtom } from 'jotai';
import { contentRefreshKeyAtom, pageErrorStatusAtom, useSetPageTitle } from '@/hooks/pages';
import { navigate as setLocation } from 'wouter/use-browser-location';

import NotFound from '@/pages/NotFound';
import LiveConsolePage from '@/pages/LiveConsole/LiveConsolePage';
import AdminManagerPage from '@/pages/AdminManager/AdminManagerPage';
import PlayersPage from '@/pages/Players/PlayersPage';
import HistoryPage from '@/pages/History/HistoryPage';
import BanTemplatesPage from '@/pages/BanTemplates/BanTemplatesPage';
import SystemLogPage from '@/pages/SystemLogPage';
import ActionLogPage from '@/pages/ActionLog/ActionLogPage';
import ServerLogPage from '@/pages/ServerLog/ServerLogPage';
import AddLegacyBanPage from '@/pages/AddLegacyBanPage';
import DashboardPage from '@/pages/Dashboard/DashboardPage';
import InsightsPage from '@/pages/InsightsPage/InsightsPage';
import ReportsPage from '@/pages/Reports/ReportsPage';
import AnalyticsPage from '@/pages/Reports/AnalyticsPage';
import PlayerDropsPage from '@/pages/PlayerDropsPage/PlayerDropsPage';
import SettingsPage from '@/pages/Settings/SettingsPage';
import AddonsManagerPage from '@/pages/AddonsManagerPage';
import EmbedEditorPage from '@/pages/Settings/EmbedEditorPage';
import DiscordLogRoutesEditorPage from '@/pages/Settings/DiscordLogRoutesEditorPage';
import FxUpdaterPage from '@/pages/FxUpdater/FxUpdaterPage';
import WhitelistPage from '@/pages/Whitelist/WhitelistPage';
import ResourcesPage from '@/pages/ResourcesPage/ResourcesPage';
import AdvancedPage from '@/pages/AdvancedPage';
import DiagnosticsPage from '@/pages/DiagnosticsPage';
import MasterActionsPage from '@/pages/MasterActionsPage';
import CfgEditorPage from '@/pages/CfgEditorPage';
import SetupPage from '@/pages/SetupPage';
import DeployerPage from '@/pages/DeployerPage';
import TestingPage from '@/pages/TestingPage/TestingPage';
import { useAdminPerms } from '@/hooks/auth';
import { useAddonLoader, type AddonPageRoute } from '@/hooks/addons';
import UnauthorizedPage from '@/pages/UnauthorizedPage';

type RouteType = {
    path: string;
    title: string;
    permission?: string;
    Page: ReactElement;
};

const allRoutes: RouteType[] = [
    //Global Routes
    {
        path: '/players',
        title: 'Players',
        Page: <PlayersPage />,
    },
    {
        path: '/history',
        title: 'History',
        Page: <HistoryPage />,
    },
    {
        path: '/reports',
        title: 'Reports',
        permission: 'players.reports',
        Page: <ReportsPage />,
    },
    {
        path: '/reports/analytics',
        title: 'Report Analytics',
        permission: 'players.reports',
        Page: <AnalyticsPage />,
    },
    {
        path: '/insights',
        title: 'Insights',
        Page: <InsightsPage />,
    },
    {
        path: '/server/player-drops',
        title: 'Player Drops',
        Page: <PlayerDropsPage />,
    },
    {
        path: '/whitelist',
        title: 'Whitelist',
        Page: <WhitelistPage />,
    },
    {
        path: '/admins',
        title: 'Admins',
        permission: 'manage.admins',
        Page: <AdminManagerPage />,
    },
    {
        path: '/settings',
        title: 'Settings',
        permission: 'settings.view',
        Page: <SettingsPage />,
    },
    {
        path: '/addons',
        title: 'Addon Manager',
        permission: 'all_permissions',
        Page: <AddonsManagerPage />,
    },
    {
        path: '/system/master-actions',
        title: 'Master Actions',
        //NOTE: content is readonly for unauthorized accounts
        Page: <MasterActionsPage />,
    },
    {
        path: '/system/diagnostics',
        title: 'Diagnostics',
        Page: <DiagnosticsPage />,
    },
    {
        path: '/system/artifacts',
        title: 'Artifacts',
        permission: 'all_permissions',
        Page: <FxUpdaterPage />,
    },
    {
        path: '/system/console-log',
        title: 'Console Log',
        permission: 'txadmin.log.view',
        Page: <SystemLogPage pageName="console" />,
    },
    {
        path: '/system/action-log',
        title: 'Action Log',
        permission: 'txadmin.log.view',
        Page: <ActionLogPage />,
    },

    //Server Routes
    {
        path: '/',
        title: 'Dashboard',
        Page: <DashboardPage />,
    },
    {
        path: '/server/console',
        title: 'Live Console',
        permission: 'console.view',
        Page: <LiveConsolePage />,
    },
    {
        path: '/server/resources',
        title: 'Resources',
        Page: <ResourcesPage />,
    },
    {
        path: '/server/server-log',
        title: 'Server Log',
        permission: 'server.log.view',
        Page: <ServerLogPage />,
    },
    {
        path: '/server/cfg-editor',
        title: 'CFG Editor',
        permission: 'server.cfg.editor',
        Page: <CfgEditorPage />,
    },
    {
        path: '/server/setup',
        title: 'Server Setup',
        permission: 'master',
        Page: <SetupPage />,
    },
    {
        path: '/server/deployer',
        title: 'Server Deployer',
        permission: 'master',
        Page: <DeployerPage />,
    },
    {
        path: '/advanced',
        title: 'Advanced',
        permission: 'all_permissions',
        Page: <AdvancedPage />,
    },

    //No nav routes
    {
        path: '/settings/ban-templates',
        title: 'Ban Templates',
        //NOTE: content is readonly for unauthorized accounts
        Page: <BanTemplatesPage />,
    },
    {
        path: '/settings/embed-editor',
        title: 'Embed Editor',
        permission: 'settings.write',
        Page: <EmbedEditorPage />,
    },
    {
        path: '/settings/discord-logs',
        title: 'Discord Logging',
        permission: 'settings.write',
        Page: <DiscordLogRoutesEditorPage />,
    },
    {
        path: '/ban-identifiers',
        title: 'Ban Identifiers',
        Page: <AddLegacyBanPage />,
    },
    //FIXME: decide on how to organize the url for the player drops page - /server/ prefix?
    //       This will likely be a part of the insights page, eventually
    // {
    //     path: '/player-crashes',
    //     title: 'Player Crashes',
    //     children: <PlayerCrashesPage />
    // },
];

function Route(route: RouteType) {
    const { hasPerm } = useAdminPerms();
    const setPageTitle = useSetPageTitle();
    setPageTitle(route.title);
    const nodeToRender =
        route.permission && !hasPerm(route.permission) ? (
            <UnauthorizedPage pageName={route.title} permission={route.permission} />
        ) : (
            route.Page
        );
    return <WouterRoute path={route.path}>{nodeToRender}</WouterRoute>;
}

function AddonRouteContent({ route }: { route: AddonPageRoute }) {
    const { hasPerm } = useAdminPerms();
    const setPageTitle = useSetPageTitle();
    setPageTitle(route.title);
    if (route.permission && !hasPerm(route.permission)) {
        return <UnauthorizedPage pageName={route.title} permission={route.permission} />;
    }
    return (
        <div className="relative w-full flex-1">
            <div className="absolute inset-0 overflow-auto">
                <route.Component />
            </div>
        </div>
    );
}

export function MainRouterInner() {
    const { pages: addonPages, loading: addonsLoading } = useAddonLoader();

    return (
        <Switch>
            {allRoutes.map((route) => (
                <Route key={route.path} {...route} />
            ))}

            {/* Addon Routes - WouterRoute must be the direct Switch child
                so that Switch can read props.path for matching. */}
            {addonPages.map((route) => (
                <WouterRoute key={route.path} path={route.path}>
                    <AddonRouteContent route={route} />
                </WouterRoute>
            ))}

            {/* While addons are loading, don't show NotFound for addon paths */}
            {addonsLoading && <WouterRoute path="/addon/:rest*">{null}</WouterRoute>}

            {/* Other Routes - they need to set the title manually */}
            {import.meta.env.DEV && (
                <WouterRoute path="/test">
                    <TestingPage />
                </WouterRoute>
            )}
            <WouterRoute component={NotFound} />
        </Switch>
    );
}

export default function MainRouter() {
    const setPageErrorStatus = useSetAtom(pageErrorStatusAtom);
    const contentRefreshKey = useAtomValue(contentRefreshKeyAtom);

    return (
        <ErrorBoundary
            key={contentRefreshKey}
            FallbackComponent={PageErrorFallback}
            onError={() => {
                console.log('Page ErrorBoundary caught an error');
                setPageErrorStatus(true);
            }}
            onReset={() => {
                console.log('Page ErrorBoundary reset');
                setLocation('/');
                setPageErrorStatus(false);
            }}
        >
            <MainRouterInner />
        </ErrorBoundary>
    );
}
