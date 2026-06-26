import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { discordComponentTypes, type DiscordCardMessagePayload } from '@shared/discordEmbedPreview/componentsV2';

const linkButtonStyle = 5;
const secondaryButtonStyle = 2;

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject => {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const intToHexColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

const FENCED_CODE = /```[\s\S]*?```/g;

const PreviewImage = ({ src, className }: { src: string; className?: string }) => (
    <img src={src} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" loading="lazy" className={className} />
);

const renderInlineMarkdown = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, lineIndex) => {
        if (line.startsWith('## ')) {
            return (
                <p key={lineIndex} className="text-base font-semibold text-[#f2f3f5]">
                    {line.slice(3)}
                </p>
            );
        }

        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|!\[[^\]]*\]\([^)]+\))/g).filter(Boolean);
        return (
            <p
                key={lineIndex}
                className="flex flex-wrap items-center gap-1.5 text-sm leading-relaxed whitespace-pre-wrap text-[#dbdee1]"
            >
                {parts.map((part, partIndex) => {
                    const imageMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
                    if (imageMatch) {
                        return (
                            <PreviewImage
                                key={partIndex}
                                src={imageMatch[2]}
                                className="size-5 shrink-0 rounded-full object-cover"
                            />
                        );
                    }
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return (
                            <strong key={partIndex} className="font-semibold text-[#f2f3f5]">
                                {part.slice(2, -2)}
                            </strong>
                        );
                    }
                    if (part.startsWith('`') && part.endsWith('`')) {
                        return (
                            <code
                                key={partIndex}
                                className="rounded bg-[#1e1f22] px-1 py-0.5 font-mono text-xs text-[#e3e5e8]"
                            >
                                {part.slice(1, -1)}
                            </code>
                        );
                    }
                    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
                        return (
                            <em key={partIndex} className="text-xs text-[#949ba4]">
                                {part.slice(1, -1)}
                            </em>
                        );
                    }
                    return <span key={partIndex}>{part}</span>;
                })}
            </p>
        );
    });
};

const renderMarkdownContent = (content: string) => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let key = 0;
    const matches = [...content.matchAll(FENCED_CODE)];

    if (!matches.length) {
        return <div className="space-y-1">{renderInlineMarkdown(content)}</div>;
    }

    for (const match of matches) {
        const start = match.index ?? 0;
        const before = content.slice(cursor, start);
        if (before.trim().length) {
            nodes.push(
                <div key={key++} className="space-y-1">
                    {renderInlineMarkdown(before)}
                </div>,
            );
        }
        const inner = match[0].slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
        nodes.push(
            <pre
                key={key++}
                className="rounded bg-[#1e1f22] px-2 py-1.5 font-mono text-xs whitespace-pre-wrap text-[#e3e5e8]"
            >
                {inner}
            </pre>,
        );
        cursor = start + match[0].length;
    }

    const tail = content.slice(cursor);
    if (tail.trim().length) {
        nodes.push(
            <div key={key++} className="space-y-1">
                {renderInlineMarkdown(tail)}
            </div>,
        );
    }

    return <div className="space-y-1">{nodes}</div>;
};

const TextDisplayBlock = ({ content }: { content: string }) => {
    return renderMarkdownContent(content);
};

const SectionBlock = ({ component }: { component: PlainObject }) => {
    const children = Array.isArray(component.components) ? component.components : [];
    const accessory = isPlainObject(component.accessory) ? component.accessory : null;
    const thumbnailUrl =
        accessory?.type === discordComponentTypes.thumbnail &&
        isPlainObject(accessory.media) &&
        typeof accessory.media.url === 'string'
            ? accessory.media.url
            : null;

    return (
        <div className="flex gap-3">
            <div className="min-w-0 flex-1 space-y-1">
                {children.map((child, index) => {
                    if (!isPlainObject(child) || child.type !== discordComponentTypes.textDisplay) return null;
                    return <TextDisplayBlock key={index} content={String(child.content ?? '')} />;
                })}
            </div>
            {thumbnailUrl ? (
                <PreviewImage src={thumbnailUrl} className="size-16 shrink-0 rounded-lg object-cover" />
            ) : null}
        </div>
    );
};

const MediaGalleryBlock = ({ component }: { component: PlainObject }) => {
    const items = Array.isArray(component.items) ? component.items : [];
    const urls = items
        .map((item) => (isPlainObject(item) && isPlainObject(item.media) ? item.media.url : null))
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

    if (!urls.length) return null;

    return (
        <div className="space-y-2">
            {urls.map((url, index) => (
                <PreviewImage key={`${url}-${index}`} src={url} className="max-h-56 w-full rounded-lg object-cover" />
            ))}
        </div>
    );
};

const ActionRowBlock = ({ component }: { component: PlainObject }) => {
    const buttons = Array.isArray(component.components) ? component.components : [];

    return (
        <div className="flex flex-wrap gap-2">
            {buttons.map((button, index) => {
                if (!isPlainObject(button) || typeof button.label !== 'string') return null;
                const isLink = button.style === linkButtonStyle && typeof button.url === 'string';
                const isDisabled = button.disabled === true;

                return (
                    <span
                        key={index}
                        className={cn(
                            'inline-flex items-center rounded-md px-3 py-1.5 text-sm font-medium',
                            isLink && 'bg-[#248046] text-white',
                            !isLink && 'bg-[#4e5058] text-[#dbdee1]',
                            isDisabled && 'cursor-not-allowed opacity-50',
                        )}
                    >
                        {button.label}
                    </span>
                );
            })}
        </div>
    );
};

const ContainerBlock = ({ component }: { component: PlainObject }) => {
    const accentColor = typeof component.accent_color === 'number' ? intToHexColor(component.accent_color) : undefined;
    const children = Array.isArray(component.components) ? component.components : [];

    return (
        <div
            className="overflow-hidden rounded-lg bg-[#2b2d31]"
            style={accentColor ? { borderLeft: `4px solid ${accentColor}` } : undefined}
        >
            <div className="space-y-3 p-3">
                {children.map((child, index) => {
                    if (!isPlainObject(child)) return null;

                    if (child.type === discordComponentTypes.textDisplay) {
                        return <TextDisplayBlock key={index} content={String(child.content ?? '')} />;
                    }
                    if (child.type === discordComponentTypes.section) {
                        return <SectionBlock key={index} component={child} />;
                    }
                    if (child.type === discordComponentTypes.separator) {
                        return <hr key={index} className="border-[#3f4147]" />;
                    }
                    if (child.type === discordComponentTypes.mediaGallery) {
                        return <MediaGalleryBlock key={index} component={child} />;
                    }
                    if (child.type === discordComponentTypes.container) {
                        return <ContainerBlock key={index} component={child} />;
                    }
                    if (child.type === actionRowType) {
                        return <ActionRowBlock key={index} component={child} />;
                    }

                    return null;
                })}
            </div>
        </div>
    );
};

const actionRowType = 1;

type DiscordCardPreviewProps = {
    payload?: DiscordCardMessagePayload | null;
    error?: string | null;
    sampleNote?: string;
    className?: string;
};

export function DiscordCardPreview({ payload, error, sampleNote, className }: DiscordCardPreviewProps) {
    return (
        <div className={cn('flex min-h-0 flex-col', className)}>
            {sampleNote ? <p className="text-muted-foreground mb-2 text-xs">{sampleNote}</p> : null}
            <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-[#313338] p-3">
                {error ? (
                    <Alert variant="destructive">
                        <AlertDescription className="text-xs whitespace-pre-wrap">{error}</AlertDescription>
                    </Alert>
                ) : payload?.components?.length ? (
                    <div className="space-y-2">
                        {payload.components.map((component, index) => {
                            if (!isPlainObject(component)) return null;
                            if (component.type === discordComponentTypes.container) {
                                return <ContainerBlock key={index} component={component} />;
                            }
                            if (component.type === actionRowType) {
                                return <ActionRowBlock key={index} component={component} />;
                            }
                            return null;
                        })}
                    </div>
                ) : (
                    <p className="text-muted-foreground text-sm">No preview available.</p>
                )}
            </div>
        </div>
    );
}
