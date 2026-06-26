import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { txToast } from '@/components/TxToaster';
import { useLocale } from '@/hooks/locale';
import { copyToClipboard } from '@/lib/utils';
import { EMBED_PLACEHOLDER_KEYS, PLAYER_TEMPLATE_PLACEHOLDER_KEYS } from '@shared/discordEmbedDraft/placeholders';
import type { EmbedEditorVariant } from '../embedEditorState';
import { ChevronDown, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

type DiscordEmbedPlaceholdersListProps = {
    variant: EmbedEditorVariant;
};

const formatToken = (key: string) => `{{${key}}}`;

type PlaceholderRowProps = {
    token: string;
    description?: string;
    onCopy: (token: string) => void;
};

function PlaceholderRow({ token, description, onCopy }: PlaceholderRowProps) {
    return (
        <li className="border-border/40 border-b py-1.5 last:border-b-0">
            <div className="flex items-center gap-1">
                <code className="text-foreground min-w-0 flex-1 truncate font-mono text-xs">{token}</code>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label={`Copy ${token}`}
                    onClick={() => onCopy(token)}
                >
                    <Copy className="size-3.5" />
                </Button>
            </div>
            {description ? <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{description}</p> : null}
        </li>
    );
}

export function DiscordEmbedPlaceholdersList({ variant }: DiscordEmbedPlaceholdersListProps) {
    const { t } = useLocale();
    const [open, setOpen] = useState(false);
    const [playerOpen, setPlayerOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const handleCopy = async (token: string) => {
        try {
            await copyToClipboard(token, rootRef.current ?? (document.body as unknown as HTMLDivElement));
            txToast.success(t('panel.common.copied'));
        } catch {
            txToast.error(t('panel.reports.copy_failed_title'));
        }
    };

    const embedDescription = (key: (typeof EMBED_PLACEHOLDER_KEYS)[number]) => {
        const msg = t(`panel.settings.embed_editor.placeholders.${key}`, { defaultValue: '' });
        return msg || undefined;
    };

    const playerDescription = (key: (typeof PLAYER_TEMPLATE_PLACEHOLDER_KEYS)[number]) => {
        const msg = t(`panel.settings.embed_editor.player_placeholders.${key}`, { defaultValue: '' });
        return msg || undefined;
    };

    return (
        <div ref={rootRef} className="border-border/60 rounded-lg border">
            <button
                type="button"
                className="hover:bg-muted/30 flex w-full items-center gap-2 px-3 py-2 text-left"
                onClick={() => setOpen(!open)}
            >
                <ChevronDown
                    className={cn('text-muted-foreground size-4 shrink-0 transition-transform', open && 'rotate-180')}
                />
                <span className="text-foreground text-sm font-medium">
                    {t('panel.settings.embed_editor.placeholders_title')}
                </span>
                <span className="text-muted-foreground ml-auto text-xs">{EMBED_PLACEHOLDER_KEYS.length}</span>
            </button>
            {open ? (
                <ScrollArea className="max-h-56 border-t">
                    <ul className="px-3 pb-2">
                        {EMBED_PLACEHOLDER_KEYS.map((key) => (
                            <PlaceholderRow
                                key={key}
                                token={formatToken(key)}
                                description={embedDescription(key)}
                                onCopy={handleCopy}
                            />
                        ))}
                    </ul>
                </ScrollArea>
            ) : null}

            {variant === 'playerList' ? (
                <>
                    <button
                        type="button"
                        className="hover:bg-muted/30 border-border/60 flex w-full items-center gap-2 border-t px-3 py-2 text-left"
                        onClick={() => setPlayerOpen(!playerOpen)}
                    >
                        <ChevronDown
                            className={cn(
                                'text-muted-foreground size-4 shrink-0 transition-transform',
                                playerOpen && 'rotate-180',
                            )}
                        />
                        <span className="text-foreground text-sm font-medium">
                            {t('panel.settings.embed_editor.player_placeholders_title')}
                        </span>
                        <span className="text-muted-foreground ml-auto text-xs">
                            {PLAYER_TEMPLATE_PLACEHOLDER_KEYS.length}
                        </span>
                    </button>
                    {playerOpen ? (
                        <ScrollArea className="max-h-48 border-t">
                            <ul className="px-3 pb-2">
                                {PLAYER_TEMPLATE_PLACEHOLDER_KEYS.map((key) => (
                                    <PlaceholderRow
                                        key={key}
                                        token={formatToken(key)}
                                        description={playerDescription(key)}
                                        onCopy={handleCopy}
                                    />
                                ))}
                            </ul>
                        </ScrollArea>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
