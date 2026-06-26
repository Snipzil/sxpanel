import { resolvePanelAssetUrl } from '@/lib/nuiEmbed';

type LogoProps = {
    className?: string;
    style?: React.CSSProperties;
};

function LogoSquareGreen({ style, className }: LogoProps) {
    const src = window.txConsts?.addonThemeLogo || resolvePanelAssetUrl('/logo.svg');
    return <img className={className} style={style} src={src} alt="fxPanel" />;
}

export const LogoFullSquareGreen = LogoSquareGreen;
