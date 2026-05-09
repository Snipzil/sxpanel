import { useEffect, useRef } from 'react';
import { hotkeyEventListener } from '@/lib/hotkeyEventListener';

type Props = {
    legacyUrl: string;
};

const sanitiseLegacyPath = (value: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\/+/g, '/');
    return cleaned.replace(/\.\./g, '').replace(/^\/+/, '');
};

export default function Iframe({ legacyUrl }: Props) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const safeLegacyPath = sanitiseLegacyPath(legacyUrl);
    const iframeSrc = `./legacy/${safeLegacyPath}`;

    //Listens to hotkeys in the iframe
    useEffect(() => {
        if (!iframeRef.current) return;
        iframeRef.current.contentWindow?.addEventListener('keydown', hotkeyEventListener);
    }, []);

    return (
        <iframe
            ref={iframeRef}
            id="legacyPageIframe" //required for the theme switcher
            src={iframeSrc}
            className="w-full"
        ></iframe>
    );
}
