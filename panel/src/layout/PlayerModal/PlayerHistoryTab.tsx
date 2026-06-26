import { cn } from '@/lib/utils';
import { tsToLocaleDateTimeString } from '@/lib/dateTime';
import { PlayerHistoryItem } from '@shared/playerApiTypes';
import InlineCode from '@/components/InlineCode';
import { useOpenActionModal } from '@/hooks/actionModal';
import ModalCentralMessage from '@/components/ModalCentralMessage';
import { useLocale } from '@/hooks/locale';

type HistoryItemProps = {
    action: PlayerHistoryItem;
    serverTime: number;
    modalOpener: (actionId: string) => void;
};

function HistoryItem({ action, serverTime, modalOpener }: HistoryItemProps) {
    const { t } = useLocale();

    let footerNote, borderColorClass, actionMessage;
    if (action.type === 'ban') {
        borderColorClass = 'border-destructive';
        actionMessage = t('panel.player_modal.history.banned_by', { author: action.author });
    } else if (action.type === 'warn') {
        borderColorClass = 'border-warning';
        actionMessage = t('panel.player_modal.history.warned_by', { author: action.author });
    } else if (action.type === 'kick') {
        borderColorClass = 'border-muted-foreground';
        actionMessage = t('panel.player_modal.history.kicked_by', { author: action.author });
    }
    if (action.revokedBy) {
        borderColorClass = '';
        const revocationDate = tsToLocaleDateTimeString(action.revokedAt ?? 0, 'medium', 'short');
        footerNote = t('panel.player_modal.history.revoked_by', {
            author: action.revokedBy,
            date: revocationDate,
        });
        if (action.revokedReason) {
            footerNote += ` ${t('panel.player_modal.history.revoked_reason', { reason: action.revokedReason })}`;
        }
    } else if (typeof action.exp === 'number') {
        const expirationDate = tsToLocaleDateTimeString(action.exp, 'medium', 'short');
        footerNote =
            action.exp < serverTime
                ? t('panel.player_modal.history.expired_on', { date: expirationDate })
                : t('panel.player_modal.history.expires_in', { date: expirationDate });
    }

    return (
        <div
            onClick={() => {
                modalOpener(action.id);
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.key === ' ') e.preventDefault();
                    modalOpener(action.id);
                }
            }}
            className={cn('hover:bg-muted bg-muted/30 cursor-pointer rounded-r-sm border-l-4 pl-2', borderColorClass)}
            role="button"
            tabIndex={0}
        >
            <div className="flex w-full justify-between">
                <strong className="text-muted-foreground text-sm">{actionMessage}</strong>
                <small className="text-2xs space-x-1 text-right">
                    <InlineCode className="tracking-widest">{action.id}</InlineCode>
                    <span
                        className="cursor-help opacity-75"
                        title={tsToLocaleDateTimeString(action.ts, 'long', 'long')}
                    >
                        {tsToLocaleDateTimeString(action.ts, 'medium', 'short')}
                    </span>
                </small>
            </div>
            <span className="text-sm">{action.reason}</span>
            {footerNote && <small className="block text-xs opacity-75">{footerNote}</small>}
        </div>
    );
}

type PlayerHistoryTabProps = {
    actionHistory: PlayerHistoryItem[];
    serverTime: number;
    refreshModalData: () => void;
};

export default function PlayerHistoryTab({ actionHistory, serverTime, refreshModalData }: PlayerHistoryTabProps) {
    const { t } = useLocale();
    const openActionModal = useOpenActionModal();

    if (!actionHistory.length) {
        return <ModalCentralMessage>{t('panel.player_modal.history.empty')}</ModalCentralMessage>;
    }

    const doOpenActionModal = (actionId: string) => {
        openActionModal(actionId);
    };

    const reversedActionHistory = [...actionHistory].reverse();
    return (
        <div className="flex flex-col gap-1 p-1">
            {reversedActionHistory.map((action) => (
                <HistoryItem key={action.id} action={action} serverTime={serverTime} modalOpener={doOpenActionModal} />
            ))}
        </div>
    );
}
