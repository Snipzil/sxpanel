import { useState } from 'react';
import type { DatabaseActionType } from '../../../../core/modules/Database/databaseTypes';
import { Button } from '@/components/ui/button';
import { GenericApiOkResp } from '@shared/genericApiTypes';
import { useAdminPerms } from '@/hooks/auth';
import { Loader2Icon } from 'lucide-react';
import { useBackendApi } from '@/hooks/fetch';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { useActionModalStateValue } from '@/hooks/actionModal';
import type { ApiRevokeActionReqSchema, ApiDeleteActionReqSchema } from '@shared/otherTypes';
import { useLocale } from '@/hooks/locale';

type ActionModifyTabProps = {
    action: DatabaseActionType;
    refreshModalData: () => void;
};

export default function ActionModifyTab({ action, refreshModalData }: ActionModifyTabProps) {
    const { t } = useLocale();
    const [isRevoking, setIsRevoking] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [revokeReason, setRevokeReason] = useState('');
    const { hasPerm } = useAdminPerms();
    const { closeModal } = useActionModalStateValue();
    const openConfirmDialog = useOpenConfirmDialog();

    const revokeActionApi = useBackendApi<GenericApiOkResp, ApiRevokeActionReqSchema>({
        method: 'POST',
        path: `/history/revokeAction`,
    });

    const deleteActionApi = useBackendApi<GenericApiOkResp, ApiDeleteActionReqSchema>({
        method: 'POST',
        path: `/history/deleteAction`,
    });

    const upperCasedType = action.type.charAt(0).toUpperCase() + action.type.slice(1);

    const doRevokeAction = () => {
        setIsRevoking(true);
        revokeActionApi({
            data: {
                actionId: action.id,
                ...(revokeReason.trim() ? { reason: revokeReason.trim() } : {}),
            },
            toastLoadingMessage: t('panel.action_modal.modify.revoking_toast', { type: action.type }),
            genericHandler: {
                successMsg: t('panel.action_modal.modify.revoked_success', { type: upperCasedType }),
            },
            success: (data) => {
                setIsRevoking(false);
                if ('success' in data) {
                    refreshModalData();
                }
            },
        });
    };

    const isAlreadyRevoked = !!action.revocation;
    const hasRevokePerm = hasPerm(action.type === 'warn' ? 'players.warn' : 'players.unban');
    const hasDeletePerm = hasPerm('players.delete');
    const revokeBtnLabel = isAlreadyRevoked
        ? t('panel.action_modal.modify.type_revoked', { type: action.type })
        : hasRevokePerm
          ? t('panel.action_modal.modify.revoke_btn', { type: upperCasedType })
          : t('panel.action_modal.modify.revoke_no_permission');

    const doDeleteAction = () => {
        openConfirmDialog({
            title: t('panel.action_modal.modify.delete_title', { type: upperCasedType }),
            message: (
                <p>
                    {t('panel.action_modal.modify.delete_confirm', { type: action.type })}
                    <br />
                    <strong>{t('panel.action_modal.modify.delete_irreversible')}</strong>
                </p>
            ),
            onConfirm: () => {
                setIsDeleting(true);
                deleteActionApi({
                    data: { actionId: action.id },
                    toastLoadingMessage: t('panel.action_modal.modify.deleting_toast', { type: action.type }),
                    genericHandler: {
                        successMsg: t('panel.action_modal.modify.deleted_success', { type: upperCasedType }),
                    },
                    success: (data) => {
                        setIsDeleting(false);
                        if ('success' in data) {
                            closeModal();
                        }
                    },
                });
            },
        });
    };

    return (
        <div className="mb-1 flex flex-col gap-4 px-1 md:mb-4">
            <div className="space-y-2">
                <h3 className="text-xl">{t('panel.action_modal.modify.revoke_title', { type: upperCasedType })}</h3>
                <p className="text-muted-foreground text-sm">
                    {t('panel.action_modal.modify.revoke_description', { type: action.type })}
                    <ul className="list-inside list-disc pt-1">
                        {action.type === 'ban' && <li>{t('panel.action_modal.modify.revoke_ban_rejoin')}</li>}
                        <li>{t('panel.action_modal.modify.revoke_no_notify')}</li>
                        <li>{t('panel.action_modal.modify.revoke_stays_history', { type: action.type })}</li>
                        <li>{t('panel.action_modal.modify.revoke_irreversible')}</li>
                    </ul>
                </p>

                <textarea
                    className="border-border bg-background placeholder:text-muted-foreground w-full rounded-md border px-3 py-2 text-sm"
                    placeholder={t('panel.action_modal.modify.revoke_placeholder')}
                    rows={2}
                    maxLength={512}
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    disabled={isAlreadyRevoked || !hasRevokePerm}
                />

                <Button
                    variant="destructive"
                    size="xs"
                    className="xs:col-span-3 xs:col-start-2 col-span-full col-start-1"
                    type="submit"
                    disabled={isAlreadyRevoked || !hasRevokePerm || isRevoking}
                    onClick={doRevokeAction}
                >
                    {isRevoking ? (
                        <span className="flex items-center leading-relaxed">
                            <Loader2Icon className="inline h-4 animate-spin" />{' '}
                            {t('panel.action_modal.modify.revoking')}
                        </span>
                    ) : (
                        revokeBtnLabel
                    )}
                </Button>
            </div>

            {action.type !== 'kick' && (
                <div className="border-border space-y-2 border-t pt-4">
                    <h3 className="text-xl">
                        {t('panel.action_modal.modify.delete_section_title', { type: upperCasedType })}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                        {t('panel.action_modal.modify.delete_section_description', { type: action.type })}
                        <ul className="list-inside list-disc pt-1">
                            <li>{t('panel.action_modal.modify.delete_removed_history')}</li>
                            <li>{t('panel.action_modal.modify.delete_cannot_undo')}</li>
                        </ul>
                    </p>
                    <Button
                        variant="destructive"
                        size="xs"
                        disabled={!hasDeletePerm || isDeleting}
                        onClick={doDeleteAction}
                    >
                        {isDeleting ? (
                            <span className="flex items-center leading-relaxed">
                                <Loader2Icon className="inline h-4 animate-spin" />{' '}
                                {t('panel.action_modal.modify.deleting')}
                            </span>
                        ) : hasDeletePerm ? (
                            t('panel.action_modal.modify.delete_btn', { type: upperCasedType })
                        ) : (
                            t('panel.action_modal.modify.delete_no_permission')
                        )}
                    </Button>
                </div>
            )}
        </div>
    );
}
