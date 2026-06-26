import { cn } from '@/lib/utils';
import { openExternalLink } from '@/lib/navigation';
import { classifyTxAnchorHref } from '@/lib/txAnchorHref';
import { ExternalLinkIcon } from 'lucide-react';
import { useLocation } from 'wouter';

//Guarantees the icon doesn't break to the next line alone
function InnerExternal({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex max-w-full items-baseline gap-1">
            <span className="min-w-0 break-words">{children}</span>
            <ExternalLinkIcon className="mb-1 inline h-5 shrink-0 selection:bg-inherit in-[.prose-sm]:h-4 in-[.text-sm]:h-4" />
        </span>
    );
}

type TxAnchorType = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    className?: string;
    rel?: string;
};
export default function TxAnchor({ children, href, className, rel, onClick: onClickProp, ...rest }: TxAnchorType) {
    const setLocation = useLocation()[1];
    const kind = classifyTxAnchorHref(href);
    const isExternal = kind === 'external-http';
    const resolvedExternalHref = isExternal && href.trimStart().startsWith('//') ? `https:${href.trim()}` : href.trim();
    const onClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        if (!href) return;
        onClickProp?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (kind === 'unsafe') {
            return;
        }
        if (isExternal) {
            openExternalLink(resolvedExternalHref);
        } else {
            setLocation(href.trim() || '/');
        }
    };

    if (kind === 'unsafe') {
        return (
            <span
                className={cn('text-muted-foreground mr-0 ml-1 cursor-default no-underline', className)}
                title="Unsupported link type (only http(s) and in-panel paths are allowed)."
            >
                {children}
            </span>
        );
    }

    return (
        <a
            {...rest}
            rel={rel ?? 'noopener noreferrer'}
            href={href}
            className={cn('text-accent mr-0 ml-1 cursor-pointer no-underline hover:underline', className)}
            onClick={onClick}
        >
            {isExternal ? <InnerExternal>{children}</InnerExternal> : children}
        </a>
    );
}
