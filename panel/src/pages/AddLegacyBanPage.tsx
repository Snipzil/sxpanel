import { useRef, useState } from 'react';
import { GavelIcon, InfoIcon, Loader2Icon } from 'lucide-react';
import InlineCode from '@/components/InlineCode';
import BanForm, { BanFormType } from '@/components/BanForm';
import { txToast } from '@/components/TxToaster';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAdminPerms } from '@/hooks/auth';
import { useBackendApi } from '@/hooks/fetch';
import { ApiAddLegacyBanReqSchema } from '@shared/otherTypes';
import { GenericApiOkResp } from '@shared/genericApiTypes';

/**
 * Add Legacy Ban V2 — redesign goals over V1:
 * - V2 header band (icon tile + title + description) replacing the raw
 *   `text-3xl` h1 and prose paragraph.
 * - Fixes the broken label association (`htmlFor="banIdentifiers"` now has
 *   a matching textarea id).
 * - `rounded-xl` card shell with the actions in a card footer instead of
 *   floating centered buttons; structured info/permission hint cards.
 */
export default function AddLegacyBanPage() {
    const idsTextareaRef = useRef<HTMLTextAreaElement>(null);
    const banFormRef = useRef<BanFormType>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { hasPerm } = useAdminPerms();

    const legacyBanApi = useBackendApi<GenericApiOkResp, ApiAddLegacyBanReqSchema>({
        method: 'POST',
        path: `/history/addLegacyBan`,
        throwGenericErrors: true,
    });

    const handleSave = () => {
        if (!idsTextareaRef.current || !banFormRef.current) return;
        const { reason, duration } = banFormRef.current.getData();

        if (!reason || reason.length < 3) {
            txToast.warning(`The reason must be at least 3 characters long.`);
            banFormRef.current.focusReason();
            return;
        }
        const rawIds = idsTextareaRef.current.value;
        if (!rawIds) {
            txToast.warning(`You must enter at least one identifier.`);
            idsTextareaRef.current.focus();
            return;
        }
        const identifiers = rawIds
            .toLowerCase()
            .split(/[,;\s\n]+/g)
            .flatMap((id) => {
                const trimmedId = id.trim();
                return trimmedId ? [trimmedId] : [];
            });
        if (!identifiers.length) {
            txToast.warning(`You must enter at least one valid identifier.`);
            idsTextareaRef.current.focus();
            return;
        }

        setIsSaving(true);
        legacyBanApi({
            data: { identifiers, reason, duration },
            toastLoadingMessage: 'Banning identifiers…',
            genericHandler: {
                successMsg: 'Identifiers banned.',
            },
            success: () => {
                setIsSaving(false);
                idsTextareaRef.current!.value = '';
                idsTextareaRef.current!.focus();
            },
            error: () => {
                setIsSaving(false);
                idsTextareaRef.current!.focus();
            },
        });
    };

    const canBan = hasPerm('players.ban');
    const isDisabled = isSaving || !canBan;

    return (
        <div className="mx-auto flex w-full max-w-(--breakpoint-lg) min-w-96 flex-col gap-4 px-2 md:px-0">
            {/* Header band */}
            <div className="border-border/60 bg-card rounded-xl border shadow-sm">
                <div className="flex min-w-0 items-center gap-3 p-4">
                    <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
                        <GavelIcon className="text-foreground size-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-foreground text-lg font-semibold tracking-tight">Ban Identifiers</h1>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                            Ban specific identifiers without searching for a registered player.
                        </p>
                    </div>
                </div>
            </div>

            {/* Info / permission hint */}
            <div className="border-border/50 bg-muted/15 flex gap-3 rounded-xl border p-3">
                <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <p className="text-muted-foreground text-xs leading-relaxed">
                    You can ban identifiers like <InlineCode>license</InlineCode> and <InlineCode>discord</InlineCode>{' '}
                    directly. Bans without a single <InlineCode>license</InlineCode> identifier are considered{' '}
                    <em>Legacy Bans</em> and should be avoided if possible.{' '}
                    {!canBan && (
                        <span className="text-warning-inline">
                            You need the <InlineCode className="text-warning-inline">Player: Ban</InlineCode> permission
                            to use this feature.
                        </span>
                    )}
                </p>
            </div>

            {/* Form card */}
            <div className="border-border/60 bg-card rounded-xl border shadow-sm">
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                    <div className="flex flex-col gap-3">
                        <Label htmlFor="banIdentifiers">Identifiers</Label>
                        <Textarea
                            id="banIdentifiers"
                            ref={idsTextareaRef}
                            className="h-full min-h-32"
                            disabled={isDisabled}
                            placeholder="discord:xxxx, fivem:xxxx, license:xxxx, steam:xxxx, etc…"
                        />
                    </div>
                    <BanForm ref={banFormRef} disabled={isDisabled} />
                </div>
                <div className="border-border/40 flex justify-end gap-2 border-t px-4 py-3">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={isDisabled}
                        onClick={() => {
                            banFormRef.current?.clearData();
                        }}
                    >
                        Clear
                    </Button>
                    <Button size="sm" variant="destructive" disabled={isDisabled} onClick={handleSave}>
                        {isSaving ? (
                            <span className="flex items-center gap-1.5 leading-relaxed">
                                <Loader2Icon className="size-4 animate-spin" /> Banning…
                            </span>
                        ) : (
                            'Apply Ban'
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
