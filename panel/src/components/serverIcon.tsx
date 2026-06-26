import { resolvePanelAssetUrl } from '@/lib/nuiEmbed';
import { cn } from '@/lib/utils';
import { AvatarFallback, AvatarImage, Avatar as ShadcnAvatar } from './ui/avatar';

type ServerIconProps = {
    serverName?: string;
    gameName?: string;
    iconFilename?: string;
    /** From `window.txConsts.server.iconDataUrl` — inlined `load_server_icon` / runtime icon for login & NUI. */
    iconDataUrl?: string;
    className?: string;
    extraClasses?: string;
};

const runtimeIconRegex = /^icon-([a-f0-9]{16})\.(png|jpe?g|gif|webp|svg|ico)$/i;

function ServerIcon({ serverName, gameName, iconFilename, iconDataUrl, className, extraClasses }: ServerIconProps) {
    const altText = serverName?.trim() ? `${serverName} icon` : 'Server icon';
    let fallbackUrl: string;
    if (gameName === 'fivem') {
        fallbackUrl = resolvePanelAssetUrl('/img/fivem-server-icon.png');
    } else if (gameName === 'redm') {
        fallbackUrl = resolvePanelAssetUrl('/img/redm-server-icon.png');
    } else {
        fallbackUrl = resolvePanelAssetUrl('/img/unknown-server-icon.png');
    }

    let iconUrl = fallbackUrl;
    if (iconDataUrl) {
        iconUrl = iconDataUrl;
    } else if (iconFilename && runtimeIconRegex.test(iconFilename)) {
        // NUI uses <base href="https://monitor/WebPipe/"> — a leading `/` resolves outside WebPipe.
        const isWebInterface =
            typeof window !== 'undefined' && window.txConsts && window.txConsts.isWebInterface === true;
        iconUrl = isWebInterface ? `/.runtime/${iconFilename}` : `.runtime/${iconFilename}`;
    }

    return (
        <ShadcnAvatar className={cn(className, extraClasses)}>
            <AvatarImage src={iconUrl} alt={altText} />
            <AvatarFallback asChild>
                <img src={fallbackUrl} alt={altText} className="aspect-square h-full w-full rounded-md" />
            </AvatarFallback>
        </ShadcnAvatar>
    );
}

export function ServerGlowIcon(props: Omit<ServerIconProps, 'extraClasses'>) {
    return (
        <div className="relative flex shrink-0">
            <ServerIcon {...props} extraClasses="size-14 xs:size-16 rounded-md z-10" />
            <ServerIcon {...props} extraClasses="size-14 xs:size-16 absolute blur-lg z-0 scale-90" />
        </div>
    );
}
