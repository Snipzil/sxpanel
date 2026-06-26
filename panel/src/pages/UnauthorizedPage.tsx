import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/locale';
import { ShieldAlertIcon } from 'lucide-react';
import { Link } from 'wouter';

function PermissionTooltip({ permission }: { permission: string }) {
    const { t } = useLocale();
    return (
        <Tooltip>
            <TooltipTrigger className="cursor-help tracking-wider underline decoration-dotted">
                {t('panel.unauthorized.permission_tooltip')}
            </TooltipTrigger>
            <TooltipContent>{permission}</TooltipContent>
        </Tooltip>
    );
}

type UnauthorizedPageProps = {
    pageName: string;
    permission: string;
};

export default function UnauthorizedPage({ pageName, permission }: UnauthorizedPageProps) {
    const { t } = useLocale();
    let messageNode;
    if (permission === 'master') {
        messageNode = (
            <>
                {t('panel.unauthorized.master_before', undefined, 'You need to be the Master account to view the ')}
                <strong className="text-accent">{pageName}</strong>
                {t('panel.unauthorized.master_after', undefined, ' page.')}
            </>
        );
    } else {
        messageNode = (
            <>
                {t('panel.unauthorized.perm_before', undefined, "You don't have the required ")}
                <PermissionTooltip permission={permission} />
                {t('panel.unauthorized.perm_mid', undefined, ' to view the ')}
                <strong className="text-accent">{pageName}</strong>
                {t('panel.unauthorized.perm_after', undefined, ' page. ')}
                <br />
                {t('panel.unauthorized.contact_owner')}
            </>
        );
    }
    return (
        <div className="bg-background flex w-full items-start justify-center px-4 pt-[7.5vh]">
            <div className="border-destructive/50 bg-destructive-hint/15 mx-auto max-w-xl space-y-4 rounded-lg border p-6 text-center">
                <h1 className="text-destructive text-2xl font-bold tracking-tight">
                    <ShieldAlertIcon className="mt-0.5 mr-2 inline size-6 align-text-top" />
                    {t('panel.unauthorized.title')}
                </h1>
                <p className="text-primary/90 mt-4 text-sm tracking-wide">{messageNode}</p>
                <Button variant="outline" size="sm" asChild>
                    <Link href="/">{t('panel.unauthorized.return_dashboard')}</Link>
                </Button>
            </div>
        </div>
    );
}
