import { PlayerModalPlayerData } from '@shared/playerApiTypes';
import { TooltipProvider } from '@/components/ui/tooltip';
import MultiIdsList from '@/components/MultiIdsList';
import { useBackendApi } from '@/hooks/fetch';
import { useAdminPerms } from '@/hooks/auth';
import { GenericApiResp } from '@shared/genericApiTypes';
import { useLocale } from '@/hooks/locale';

type PlayerIdsTabProps = {
    player: PlayerModalPlayerData;
    refreshModalData: () => void;
};

export default function PlayerIdsTab({ player, refreshModalData }: PlayerIdsTabProps) {
    const { t } = useLocale();
    const { hasPerm } = useAdminPerms();
    const hasDeletePerm = hasPerm('players.delete');

    const wipeIdsApi = useBackendApi<GenericApiResp>({
        method: 'POST',
        path: `/player/wipe_ids`,
    });
    const wipeHwidsApi = useBackendApi<GenericApiResp>({
        method: 'POST',
        path: `/player/wipe_hwids`,
    });

    const queryParams = player.license ? { license: player.license } : {};

    const onWipeIds = hasDeletePerm
        ? () => {
              wipeIdsApi({
                  queryParams,
                  toastLoadingMessage: t('panel.player_modal.toasts.wipe_ids'),
                  genericHandler: {
                      successMsg: t('panel.player_modal.toasts.wipe_ids_success'),
                  },
                  success: (data) => {
                      if ('success' in data) {
                          refreshModalData();
                      }
                  },
              });
          }
        : undefined;

    const onWipeHwids = hasDeletePerm
        ? () => {
              wipeHwidsApi({
                  queryParams,
                  toastLoadingMessage: t('panel.player_modal.toasts.wipe_hwids'),
                  genericHandler: {
                      successMsg: t('panel.player_modal.toasts.wipe_hwids_success'),
                  },
                  success: (data) => {
                      if ('success' in data) {
                          refreshModalData();
                      }
                  },
              });
          }
        : undefined;

    return (
        <TooltipProvider>
            <div className="flex flex-col gap-4 p-1">
                <MultiIdsList
                    type="id"
                    src="player"
                    list={player?.oldIds ?? []}
                    highlighted={player.ids}
                    onWipeIds={onWipeIds}
                />
                <MultiIdsList
                    type="hwid"
                    src="player"
                    list={player?.oldHwids ?? []}
                    highlighted={player.hwids}
                    onWipeIds={onWipeHwids}
                />
            </div>
        </TooltipProvider>
    );
}
