import { cn, stripIndent } from '@/lib/utils';
import Markdown, { Components } from 'react-markdown';
import InlineCode from './InlineCode';
import TxAnchor from './TxAnchor';

// NOTE: we might not even need this
// https://tailwindcss.com/docs/typography-plugin#advanced-topics
const customComponents: Components = {
    // blockquote: ({ children }) => <blockquote className="border-l-4 border-pink-600 pl-2">{children}</blockquote>,
    code: ({ children }) => (
        <InlineCode className="not-prose [.prose-toast_&:not(pre_*)]:bg-muted/65">{children}</InlineCode>
    ),
    pre: ({ children }) => (
        <pre className="not-prose bg-muted in-[.prose-toast]:bg-muted/65 rounded p-2 wrap-anywhere break-all whitespace-pre-wrap [.prose-toast_&>code]:bg-transparent">
            {children}
        </pre>
    ),
    a: ({ children, href }) => <TxAnchor href={href!}>{children}</TxAnchor>,
};

type MarkdownProseProps = {
    md: string;
    isSmall?: boolean;
    isTitle?: boolean;
    isToast?: boolean;
};
export default function MarkdownProse({ md, isSmall, isTitle, isToast }: MarkdownProseProps) {
    return (
        <div
            className={cn(
                'prose prose-invert prose-zinc',
                isSmall && 'prose-sm',
                isTitle && 'tracking-wide',
                isToast && 'prose-toast',
            )}
        >
            <Markdown components={customComponents}>{stripIndent(md.replace(/\n/g, '  \n'))}</Markdown>
        </div>
    );
}
