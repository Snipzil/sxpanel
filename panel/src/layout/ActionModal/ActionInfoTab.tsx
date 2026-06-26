import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { msToDuration } from '@/lib/dateTime';
import { useRef, useState } from 'react';
import type { DatabaseActionType } from '../../../../core/modules/Database/databaseTypes';
import { useOpenPlayerModal } from '@/hooks/playerModal';
import DateTimeCorrected from '@/components/DateTimeCorrected';
import { useLocale } from '@/hooks/locale';

const calcTextAreaLines = (text?: string) => {
    if (!text) return 3;
    const lines = text.trim().split('\n').length + 1;
    return Math.min(Math.max(lines, 3), 16);
};

function ActionReasonBox({ actionReason }: { actionReason: string }) {
    const { t } = useLocale();
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const [textAreaLines, setTextAreaLines] = useState(calcTextAreaLines(actionReason));

    return (
        <>
            <Label htmlFor="actionReason">{t('panel.action_modal.info.reason_label')}</Label>
            <Textarea
                ref={textAreaRef}
                id="actionReason"
                className="mt-1 w-full"
                readOnly={true}
                value={actionReason}
                //1rem of padding + 1.25rem per line
                style={{ height: `${1 + 1.25 * textAreaLines}rem` }}
            />
        </>
    );
}

type ActionInfoTabProps = {
    action: DatabaseActionType;
    serverTime: number;
    tsFetch: number;
};

export default function ActionInfoTab({ action, serverTime, tsFetch }: ActionInfoTabProps) {
    const { t } = useLocale();
    const openPlayerModal = useOpenPlayerModal();

    let banExpirationText: React.ReactNode;
    if (action.type === 'ban') {
        if (action.expiration === false) {
            banExpirationText = <span className="text-destructive-inline">{t('panel.common.never')}</span>;
        } else if (action.expiration > serverTime) {
            const distance = msToDuration((serverTime - action.expiration) * 1000, {
                units: ['mo', 'w', 'd', 'h', 'm'],
            });
            banExpirationText = (
                <span className="text-warning-inline">{t('panel.action_modal.info.expires_in', { distance })}</span>
            );
        } else {
            banExpirationText = (
                <DateTimeCorrected
                    className="cursor-help opacity-75"
                    serverTime={serverTime}
                    tsObject={action.expiration}
                    tsFetch={tsFetch}
                />
            );
        }
    }

    let warnAckedText: React.ReactNode;
    if (action.type === 'warn' && action.acked) {
        warnAckedText = <span className="opacity-75">{t('panel.common.yes')}</span>;
    } else {
        warnAckedText = <span className="text-warning-inline">{t('panel.action_modal.info.not_yet')}</span>;
    }

    let revokedText: React.ReactNode;
    if (action.revocation?.timestamp) {
        revokedText = (
            <span className="text-warning-inline">
                {t('panel.action_modal.info.revoked_by', { author: action.revocation.author })}{' '}
                <DateTimeCorrected
                    isDateOnly
                    className="cursor-help"
                    serverTime={serverTime}
                    tsObject={action.revocation.timestamp}
                    tsFetch={tsFetch}
                />
                {action.revocation.reason && (
                    <>
                        <br />
                        <span className="text-muted-foreground">
                            {t('panel.action_modal.info.revocation_reason', {
                                reason: action.revocation.reason,
                            })}
                        </span>
                    </>
                )}
            </span>
        );
    } else {
        revokedText = <span className="opacity-75">{t('panel.common.no')}</span>;
    }

    //Player stuff
    const playerDisplayName =
        action.playerName !== false ? (
            <span>{action.playerName}</span>
        ) : (
            <span className="italic opacity-75">{t('panel.action_modal.info.unknown_player')}</span>
        );
    const targetLicenses = action.ids.filter((id) => id.startsWith('license:'));
    const linkedPlayer = targetLicenses.length === 1 ? targetLicenses[0].split(':')[1] : false;
    const handleViewPlayerClick = () => {
        if (!linkedPlayer) return;
        openPlayerModal({ license: linkedPlayer });
    };

    return (
        <div className="mb-1 px-1 md:mb-4">
            <dl className="pb-2">
                <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                    <dt className="text-muted-foreground text-sm leading-6 font-medium">
                        {t('panel.action_modal.info.date_time')}
                    </dt>
                    <dd className="col-span-2 mt-0 text-sm leading-6">
                        <DateTimeCorrected
                            className="cursor-help opacity-75"
                            serverTime={serverTime}
                            tsObject={action.timestamp}
                            tsFetch={tsFetch}
                        />
                    </dd>
                </div>
                {action.type === 'ban' && (
                    <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                        <dt className="text-muted-foreground text-sm leading-6 font-medium">
                            {t('panel.action_modal.info.expiration')}
                        </dt>
                        <dd className="col-span-2 mt-0 text-sm leading-6">{banExpirationText}</dd>
                    </div>
                )}
                {action.type === 'warn' && (
                    <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                        <dt className="text-muted-foreground text-sm leading-6 font-medium">
                            {t('panel.action_modal.info.player_accepted')}
                        </dt>
                        <dd className="col-span-2 mt-0 text-sm leading-6">{warnAckedText}</dd>
                    </div>
                )}
                <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                    <dt className="text-muted-foreground text-sm leading-6 font-medium">
                        {t('panel.action_modal.info.revoked')}
                    </dt>
                    <dd className="col-span-2 mt-0 text-sm leading-6">{revokedText}</dd>
                </div>

                <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                    <dt className="text-muted-foreground text-sm leading-6 font-medium">
                        {t('panel.action_modal.info.admin')}
                    </dt>
                    <dd className="col-span-2 mt-0 text-sm leading-6">{action.author}</dd>
                </div>
                <div className="grid grid-cols-3 gap-4 px-0 py-0.5">
                    <dt className="text-muted-foreground text-sm leading-6 font-medium">
                        {t('panel.action_modal.info.player')}
                    </dt>
                    <dd className="col-span-2x mt-0 text-sm leading-6">{playerDisplayName}</dd>
                    <dd className="text-right">
                        <Button
                            variant="outline"
                            size="inline"
                            style={{ minWidth: '8.25ch' }}
                            onClick={handleViewPlayerClick}
                            disabled={!linkedPlayer}
                        >
                            {t('panel.common.view')}
                        </Button>
                    </dd>
                </div>
            </dl>

            <ActionReasonBox actionReason={action.reason} />
        </div>
    );
}
