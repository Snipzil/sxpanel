import { CompassIcon, HomeIcon } from 'lucide-react';
import { Link } from 'wouter';
import InlineCode from '@/components/InlineCode';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/locale';
import type { NotFoundProps } from './notFoundTypes';

/**
 * NotFound V2 — redesign goals over V1:
 * - Replaces the hardcoded `bg-fuchsia-600` heading with a token-based card
 *   treatment consistent with UnauthorizedPage and the V2 design language.
 * - Adds an icon tile, proper typographic hierarchy, and a Button CTA.
 */
export default function NotFound({ params }: NotFoundProps) {
    const { t } = useLocale();
    const path = `/${params['*']}`;

    return (
        <div className="flex w-full items-center justify-center pt-[7.5vh]">
            <div
                className="border-border/60 bg-background flex w-full max-w-md flex-col items-center gap-4 rounded-xl border p-8 text-center"
                role="status"
            >
                <div className="bg-secondary/50 flex size-14 items-center justify-center rounded-xl">
                    <CompassIcon className="text-muted-foreground size-7" />
                </div>
                <div className="space-y-1">
                    <p className="text-muted-foreground/70 text-xs font-semibold tracking-widest uppercase">404</p>
                    <h1 className="text-foreground text-xl font-semibold tracking-tight">
                        {t('panel.not_found.title')}
                    </h1>
                </div>
                <p className="text-muted-foreground text-sm">
                    {t('panel.not_found.path_before', undefined, 'The page ')}
                    <InlineCode>{path}</InlineCode>
                    {t('panel.not_found.path_after', undefined, ' does not seem to be correct.')}
                </p>
                <Button asChild variant="outline" size="sm">
                    <Link href="/">
                        <HomeIcon className="mr-1.5 size-4" />
                        {t('panel.not_found.return_dashboard')}
                    </Link>
                </Button>
            </div>
        </div>
    );
}
