import { useState } from 'react';
import useSWR from 'swr';
import { useAdminPerms } from '@/hooks/auth';
import { useAuthedFetcher } from '@/hooks/fetch';
import { cn } from '@/lib/utils';
import { BellOffIcon, PackageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { navigate } from 'wouter/use-browser-location';
import type { AddonListItem } from '@shared/addonTypes';
import { useLocale } from '@/hooks/locale';

const LOCALSTORAGE_KEY = 'addonApprovalDismissed';

interface AddonsListResponse {
    addons: AddonListItem[];
    config: { enabled: boolean };
    error?: string;
}

/**
 * Get the set of addon IDs that were dismissed.
 * Returns null if nothing was dismissed.
 */
function getDismissedIds(): string[] | null {
    try {
        const raw = localStorage.getItem(LOCALSTORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/**
 * Check if the current pending set is still dismissed.
 * If a new addon appears or an old one disappears, the banner reshows.
 */
function isDismissed(pendingIds: string[]): boolean {
    const dismissed = getDismissedIds();
    if (!dismissed) return false;
    // Same set of IDs = still dismissed
    if (dismissed.length !== pendingIds.length) return false;
    const sorted = [...pendingIds].sort();
    const sortedDismissed = [...dismissed].sort();
    return sorted.every((id, i) => id === sortedDismissed[i]);
}

export default function AddonWarningBar() {
    const { hasPerm } = useAdminPerms();

    // Only render for superadmins
    if (!hasPerm('all_permissions')) return null;

    return <AddonWarningBarInner />;
}

function AddonWarningBarInner() {
    const { t } = useLocale();
    const fetcher = useAuthedFetcher();
    const [dismissed, setDismissed] = useState(false);
    const { data } = useSWR<AddonsListResponse>('/addons/list', (url: string) => fetcher(url), {
        refreshInterval: 30_000,
        revalidateOnFocus: true,
    });

    const pendingAddons = data?.addons?.filter((a) => a.state === 'discovered') ?? [];
    if (pendingAddons.length === 0) return null;

    const pendingIds = pendingAddons.map((a) => a.id);

    // Check localStorage-based dismissal (or component-level dismiss)
    if (dismissed || isDismissed(pendingIds)) return null;

    const reapprovalCount = pendingAddons.filter((a) => a.needsReapproval).length;
    const newCount = pendingAddons.length - reapprovalCount;

    let message: string;
    if (reapprovalCount > 0 && newCount > 0) {
        message = t('panel.shell.addon_warning.awaiting_and_reapproval', {
            newCount,
            reapprovalCount,
        });
    } else if (reapprovalCount > 0) {
        message = t('panel.shell.addon_warning.reapproval_only', { count: reapprovalCount });
    } else {
        message = t('panel.shell.addon_warning.awaiting_only', { count: newCount });
    }

    const handleDismiss = () => {
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(pendingIds));
        setDismissed(true);
    };

    return (
        <div className="top-navbarvh fixed z-40 flex w-full justify-center">
            <div
                className={cn(
                    'h-9 w-full overflow-hidden hover:h-24 sm:w-lg sm:rounded-b-md',
                    'flex flex-col items-center justify-center p-2',
                    'group cursor-default shadow-xl transition-[height]',
                    'bg-warning text-warning-foreground',
                )}
            >
                <h2 className="text-md group-hover:font-medium">
                    <PackageIcon className="-mt-1 mr-1 inline h-[1.2rem]" />
                    {t('panel.shell.addon_warning.title')}
                </h2>

                <span className="hidden text-center text-sm group-hover:block">
                    {message}
                    <div className="mt-2 flex flex-row items-center justify-center gap-3">
                        <Button
                            size="xs"
                            variant="outline"
                            className="border-current hover:bg-white/10"
                            onClick={handleDismiss}
                        >
                            <BellOffIcon className="mr-1 h-[0.9rem]" /> {t('panel.shell.addon_warning.dismiss')}
                        </Button>
                        <Button
                            size="xs"
                            variant="outline"
                            className="border-current hover:bg-white/10"
                            onClick={() => {
                                window.location.hash = 'addons';
                                navigate('/addons');
                            }}
                        >
                            <PackageIcon className="mr-1 h-[0.9rem]" /> {t('panel.shell.addon_warning.go_to_addons')}
                        </Button>
                    </div>
                </span>
            </div>
        </div>
    );
}
