import { memo, useEffect, useState } from 'react';
import { deferralImageDataUriToObjectUrl, isDeferralGifDataUri } from '@shared/deferralCardSvg';

type DeferralStudioAnimatedImageProps = {
    src: string;
    className?: string;
    alt?: string;
};

/**
 * Stable GIF/PNG preview — blob URLs for GIFs so React re-renders do not re-decode huge data URIs.
 */
export const DeferralStudioAnimatedImage = memo(function DeferralStudioAnimatedImage({
    src,
    className,
    alt = '',
}: DeferralStudioAnimatedImageProps) {
    const [displaySrc, setDisplaySrc] = useState(src);

    useEffect(() => {
        if (!isDeferralGifDataUri(src)) {
            setDisplaySrc(src);
            return;
        }
        const objectUrl = deferralImageDataUriToObjectUrl(src);
        if (!objectUrl) {
            setDisplaySrc(src);
            return;
        }
        setDisplaySrc(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [src]);

    return <img src={displaySrc} alt={alt} className={className} decoding="async" />;
});
