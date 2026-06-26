import { Button } from '@/components/ui/button';
import { useAdminPerms } from '@/hooks/auth';
import { PlayerModalRefType, useClosePlayerModal } from '@/hooks/playerModal';
import { useLocale } from '@/hooks/locale';
import { Loader2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useBackendApi } from '@/hooks/fetch';
import { GenericApiOkResp } from '@shared/genericApiTypes';
import ModalCentralMessage from '@/components/ModalCentralMessage';
import BanForm, { BanFormType } from '@/components/BanForm';
import { txToast } from '@/components/TxToaster';

type PlayerBanTabProps = {
    playerRef: PlayerModalRefType;
};

export default function PlayerBanTab({ playerRef }: PlayerBanTabProps) {
    const { t } = useLocale();
    const banFormRef = useRef<BanFormType>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { hasPerm } = useAdminPerms();
    const closeModal = useClosePlayerModal();
    const playerBanApi = useBackendApi<GenericApiOkResp>({
        method: 'POST',
        path: `/player/ban`,
        throwGenericErrors: true,
    });

    if (!hasPerm('players.ban')) {
        return <ModalCentralMessage>{t('panel.player_modal.ban.no_permission')}</ModalCentralMessage>;
    }

    const handleSave = () => {
        if (!banFormRef.current) return;
        const { reason, duration } = banFormRef.current.getData();

        if (!reason || reason.length < 3) {
            txToast.warning(t('panel.player_modal.ban.reason_min_length'));
            banFormRef.current.focusReason();
            return;
        }

        setIsSaving(true);
        playerBanApi({
            queryParams: playerRef,
            data: { reason, duration },
            toastLoadingMessage: t('panel.player_modal.ban.banning'),
            genericHandler: {
                successMsg: t('panel.player_modal.ban.success'),
            },
            success: (data) => {
                setIsSaving(false);
                closeModal();
            },
            error: (error) => {
                setIsSaving(false);
            },
        });
    };

    return (
        <div className="grid gap-4 p-1">
            <BanForm
                ref={banFormRef}
                disabled={isSaving}
                onNavigateAway={() => {
                    closeModal();
                }}
            />
            <div className="flex place-content-end">
                <Button size="sm" variant="destructive" disabled={isSaving} onClick={handleSave}>
                    {isSaving ? (
                        <span className="flex items-center leading-relaxed">
                            <Loader2Icon className="inline h-4 animate-spin" />{' '}
                            {t('panel.player_modal.ban.banning_btn')}
                        </span>
                    ) : (
                        t('panel.player_modal.ban.apply')
                    )}
                </Button>
            </div>
        </div>
    );
}
