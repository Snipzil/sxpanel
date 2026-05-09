import { Button } from '@/components/ui/button';
import useWarningBar from '@/hooks/useWarningBar';
import { cn } from '@/lib/utils';
import { BellOffIcon, CloudOffIcon, DownloadCloudIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FaDiscord, FaGithub } from 'react-icons/fa';

const LOCALSTORAGE_KEY = 'tsUpdateDismissed';
const MAJOR_DISMISSAL_TIME = 12 * 60 * 60 * 1000;
const MINOR_DISMISSAL_TIME = 48 * 60 * 60 * 1000;

const getTsUpdateDismissed = () => {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!stored) return false;
    const parsed = parseInt(stored);
    if (isNaN(parsed)) return false;
    return parsed;
};

const checkPostponeStatus = (isImportant: boolean) => {
    const tsLastDismissal = getTsUpdateDismissed();
    const tsNow = Date.now();
    const maxTime = isImportant ? MAJOR_DISMISSAL_TIME : MINOR_DISMISSAL_TIME;
    if (!tsLastDismissal || tsLastDismissal + maxTime < tsNow) {
        return true;
    }
    return false;
};

type InnerWarningBarProps = {
    titleIcon: React.ReactNode;
    title: React.ReactNode;
    description: React.ReactNode;
    isImportant: boolean;
    canPostpone: boolean;
    canHidePermanently?: boolean;
};

export function InnerWarningBar({
    titleIcon,
    title,
    description,
    isImportant,
    canPostpone,
    canHidePermanently,
}: InnerWarningBarProps) {
    const [rand, setRand] = useState(0);

    const forceRerender = () => {
        setRand(Math.random());
    };

    const postponeUpdate = () => {
        localStorage.setItem(LOCALSTORAGE_KEY, Date.now().toString());
        forceRerender();
    };

    useEffect(() => {
        const interval = setInterval(() => {
            forceRerender();
        }, 60_000);
        return () => clearInterval(interval);
    }, []);

    if (canPostpone && !checkPostponeStatus(isImportant)) return null;
    if (canHidePermanently && window.txConsts.hideFxsUpdateNotification) return null;
    return (
        <div className="top-navbarvh fixed z-40 flex w-full justify-center">
            <div
                className={cn(
                    'h-9 w-full overflow-hidden hover:h-40 sm:w-lg sm:rounded-b-md',
                    'flex flex-col items-center justify-center p-2',
                    'group cursor-default shadow-xl transition-[height]',
                    isImportant ? 'bg-destructive text-destructive-foreground' : 'bg-info text-info-foreground',
                )}
            >
                <h2 className="text-md group-hover:font-medium">
                    {titleIcon}
                    {title}
                </h2>

                <span className="hidden text-center text-sm group-hover:block">
                    {description}
                    <div className="mt-3 flex flex-row items-center justify-center gap-3">
                        {canPostpone && (
                            <Button
                                size="xs"
                                variant="outline"
                                onClick={() => postponeUpdate()}
                                className="border-current hover:bg-white/10"
                            >
                                <BellOffIcon className="mr-1 h-[0.9rem]" /> Postpone
                            </Button>
                        )}

                        <Button size="xs" variant="outline" asChild className="border-current hover:bg-white/10">
                            <a href="https://github.com/SomeAussieGaymer/fxPanel/releases" target="_blank">
                                <FaGithub size="14" className="mr-1" /> Download
                            </a>
                        </Button>

                        <Button size="xs" variant="outline" asChild className="border-current hover:bg-white/10">
                            <a href="https://discord.gg/6FcqBYwxH5" target="_blank">
                                <FaDiscord size="14" className="mr-1" /> Support
                            </a>
                        </Button>
                    </div>
                </span>
            </div>
        </div>
    );
}

export default function WarningBar() {
    const { offlineWarning, txUpdateData, fxUpdateData } = useWarningBar();

    if (offlineWarning) {
        return (
            <InnerWarningBar
                titleIcon={<CloudOffIcon className="-mt-1 mr-1 inline h-[1.2rem]" />}
                title="Socket connection lost."
                description={
                    <>
                        The connection to the fxPanel server has been lost. <br />
                        If you closed FXServer, please restart it.
                    </>
                }
                isImportant={true}
                canPostpone={false}
            />
        );
    } else if (txUpdateData) {
        return (
            <InnerWarningBar
                titleIcon={<DownloadCloudIcon className="-mt-1 mr-1 inline h-[1.2rem]" />}
                title={
                    txUpdateData.isImportant
                        ? 'This version of fxPanel is outdated.'
                        : 'A patch (bug fix) update is available for fxPanel.'
                }
                description={
                    txUpdateData.isImportant
                        ? `Version v${txUpdateData.version} has been released bringing new features, bug fixes and improvements.`
                        : `If you are experiencing any kind of issue, please update to v${txUpdateData.version}.`
                }
                isImportant={txUpdateData.isImportant}
                canPostpone={true}
            />
        );
    } else if (fxUpdateData) {
        return (
            <InnerWarningBar
                titleIcon={<DownloadCloudIcon className="-mt-1 mr-1 inline h-[1.2rem]" />}
                title={
                    fxUpdateData.isImportant
                        ? 'This version of FXServer is outdated.'
                        : 'An update is available for FXServer.'
                }
                description={`Please update FXServer to artifact ${fxUpdateData.version}.`}
                isImportant={fxUpdateData.isImportant}
                canPostpone={true}
                canHidePermanently={true}
            />
        );
    } else {
        return null;
    }
}
