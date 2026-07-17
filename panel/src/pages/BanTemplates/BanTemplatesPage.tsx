import { useEffect, useState } from 'react';
import { GavelIcon, InfoIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import useSWR from 'swr';
import { customAlphabet } from 'nanoid';
import { alphanumeric } from 'nanoid-dictionary';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import InlineCode from '@/components/InlineCode';
import { DndSortableGroup, DndSortableItem } from '@/components/dndSortable';
import { Button } from '@/components/ui/button';
import { useAdminPerms } from '@/hooks/auth';
import { useOpenConfirmDialog } from '@/hooks/dialogs';
import { BackendApiError, useBackendApi } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import { cn } from '@/lib/utils';
import BanTemplatesInputDialog from '@/pages/BanTemplates/BanTemplatesInputDialog';
import type { BanTemplatesInputData } from '@/pages/BanTemplates/banTemplatesTypes';
import {
    BanTemplatesDataType,
    GetBanTemplatesSuccessResp,
    SaveBanTemplatesReq,
    SaveBanTemplatesResp,
} from '@shared/otherTypes';
import { BanTemplatesHeaderBand, type BanTemplatesSaveStatus } from './BanTemplatesHeaderBand';
import BanTemplatesListItem from './BanTemplatesListItem';

const nanoid = customAlphabet(alphanumeric, 21);

type DataUpdaterFunc = (prev: BanTemplatesDataType[]) => BanTemplatesDataType[];

/**
 * Ban Templates V2 — redesign goals over V1:
 * - V2 header band with breadcrumb, description, stat pills (total /
 *   permanent / timed), and a live save-status pill.
 * - List inside a `rounded-xl bg-card` shell instead of a flat bordered box.
 * - Error banners with retry buttons instead of inline underlined links.
 * - Token-based duration chips and labeled icon actions (fixes the
 *   `bg-black/40` light-mode chip and the `text-success-inlinex` typo).
 * - Structured empty/loading states matching the V2 design language.
 */
export default function BanTemplatesPage() {
    const { t } = useLocale();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [reasonInputDialogData, setReasonInputDialogData] = useState<BanTemplatesInputData | undefined>();
    const openConfirmDialog = useOpenConfirmDialog();
    const { hasPerm } = useAdminPerms();
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaveSuccessful, setIsSaveSuccessful] = useState(false);

    const queryApi = useBackendApi<GetBanTemplatesSuccessResp>({
        method: 'GET',
        path: `/settings/banTemplates`,
        throwGenericErrors: true,
    });

    const saveApi = useBackendApi<SaveBanTemplatesResp, SaveBanTemplatesReq>({
        method: 'POST',
        path: `/settings/banTemplates`,
        throwGenericErrors: true,
    });

    const swr = useSWR<BanTemplatesDataType[]>(
        '/settings/banTemplates',
        async () => {
            const data = await queryApi({});
            if (!data) throw new Error('No data returned');
            return data;
        },
        {
            isPaused: () => isSaving || !!saveError || isDialogOpen,
        },
    );

    const updateBackend = async (updater: DataUpdaterFunc) => {
        setIsSaving(true);
        setSaveError(null);
        setIsSaveSuccessful(false);
        try {
            const data = await swr.mutate(updater as any, false);
            const resp = await saveApi({ data });
            if (!resp) throw new Error('No data returned');
            setIsSaveSuccessful(true);
        } catch (error) {
            if (error instanceof BackendApiError || error instanceof Error) {
                setSaveError(error.message);
            } else {
                setSaveError(JSON.stringify(error));
            }
        } finally {
            setIsSaving(false);
        }
    };

    //Clear the save successful after 5 seconds
    useEffect(() => {
        if (!isSaveSuccessful) return;
        const timeout = setTimeout(() => {
            setIsSaveSuccessful(false);
        }, 5000);
        return () => clearTimeout(timeout);
    }, [isSaveSuccessful]);

    //Drag and drop
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            updateBackend((items) => {
                const oldIndex = items.findIndex((x) => x.id === active.id);
                const newIndex = items.findIndex((x) => x.id === over.id);

                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleOnSave = ({ id, reason, duration }: BanTemplatesInputData) => {
        if (id) {
            updateBackend((prev) => prev.map((item) => (item.id === id ? { id, reason, duration } : item)));
        } else {
            updateBackend((prev) => [
                ...prev,
                {
                    id: nanoid(21),
                    reason,
                    duration,
                },
            ]);
        }
        setIsDialogOpen(false);
        setReasonInputDialogData(undefined);
    };

    //Handlers for list actions
    const handleRemoveItem = (id: string) => {
        if (!id || !swr.data) return;
        const toBeRemoved = swr.data.find((item: BanTemplatesDataType) => item.id === id);
        if (!toBeRemoved) return;
        openConfirmDialog({
            title: 'Remove Template',
            actionLabel: 'Remove',
            confirmBtnVariant: 'destructive',
            message: (
                <>
                    Are you sure you want to remove this ban template? <br />
                    <blockquote className="border-l-4 pl-2 italic opacity-70">{toBeRemoved.reason}</blockquote>
                </>
            ),
            onConfirm: () => {
                updateBackend((prev) => prev.filter((item) => item.id !== id));
            },
        });
    };
    const handleEditItem = (id: string) => {
        if (!id || !swr.data) return;
        setReasonInputDialogData(swr.data.find((item: BanTemplatesDataType) => item.id === id));
        setIsDialogOpen(true);
    };
    const handleAddNewItem = () => {
        setReasonInputDialogData(undefined);
        setIsDialogOpen(true);
    };
    const handleRetryLoad = () => swr.mutate();
    const handleRetrySave = () => {
        if (!swr.data) return;
        updateBackend(() => swr.data!);
    };

    //Derived state
    const canEdit = hasPerm('settings.write');
    const permanentCount = swr.data?.filter((item) => item.duration === 'permanent').length;
    const timedCount =
        swr.data !== undefined && permanentCount !== undefined ? swr.data.length - permanentCount : undefined;

    let saveStatus: BanTemplatesSaveStatus = 'idle';
    if (isSaving) saveStatus = 'saving';
    else if (saveError || swr.error) saveStatus = 'error';
    else if (isSaveSuccessful) saveStatus = 'saved';
    else if (swr.isLoading || swr.isValidating) saveStatus = 'loading';

    return (
        <div className="mx-auto mb-10 flex w-full max-w-(--breakpoint-lg) min-w-96 flex-col px-2 md:px-0">
            <BanTemplatesHeaderBand
                title={t('panel.routes.ban_templates')}
                parentName={t('panel.routes.settings')}
                totalCount={swr.data?.length}
                permanentCount={permanentCount}
                timedCount={timedCount}
                saveStatus={saveStatus}
            />

            {/* Error banners with retry */}
            {swr.error && (
                <div
                    className="border-destructive/40 bg-destructive/10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
                    role="alert"
                >
                    <p className="text-destructive-inline text-sm">
                        Error loading templates: {swr.error?.message ?? 'unknown error'}
                    </p>
                    <Button variant="outline" size="sm" onClick={handleRetryLoad}>
                        Try again
                    </Button>
                </div>
            )}
            {saveError && (
                <div
                    className="border-destructive/40 bg-destructive/10 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
                    role="alert"
                >
                    <p className="text-destructive-inline text-sm">Error saving: {saveError}</p>
                    <Button variant="outline" size="sm" onClick={handleRetrySave}>
                        Try again
                    </Button>
                </div>
            )}

            {/* Permission / usage hint */}
            <div className="border-border/50 bg-secondary/40 mb-4 flex gap-3 rounded-xl border p-3">
                <InfoIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <p className="text-muted-foreground text-xs leading-relaxed">
                    These reasons appear as dropdown options when banning a player — useful for frequent cases like rule
                    violations.{' '}
                    {canEdit ? (
                        <span className="italic">Drag the handle to reorder the list.</span>
                    ) : (
                        <span className="text-warning-inline">
                            You need the <InlineCode className="text-warning-inline">Settings: Change</InlineCode>{' '}
                            permission to edit these reasons.
                        </span>
                    )}
                </p>
            </div>

            {/* List card */}
            <div className="border-border/60 bg-background rounded-xl border p-3">
                {!swr.data && !saveError ? (
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-12">
                        <Loader2Icon className="size-6 animate-spin" />
                        <p className="text-sm">Loading templates…</p>
                    </div>
                ) : swr.data ? (
                    <DndSortableGroup
                        className="space-y-2"
                        ids={swr.data.map((item: BanTemplatesDataType) => item.id)}
                        onDragEnd={handleDragEnd}
                    >
                        {!swr.data.length ? (
                            <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-12">
                                <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
                                    <GavelIcon className="size-6" />
                                </div>
                                <p className="text-sm font-medium">No reasons configured yet</p>
                                <p className="text-muted-foreground/70 max-w-xs text-center text-xs">
                                    Add your first ban template to speed up moderation actions.
                                </p>
                            </div>
                        ) : (
                            swr.data.map((item: BanTemplatesDataType) => (
                                <DndSortableItem key={item.id} id={item.id} disabled={!canEdit}>
                                    <BanTemplatesListItem
                                        onEdit={handleEditItem}
                                        onRemove={handleRemoveItem}
                                        disabled={!canEdit}
                                        {...item}
                                    />
                                </DndSortableItem>
                            ))
                        )}
                        <li>
                            <button
                                type="button"
                                disabled={!canEdit}
                                onClick={handleAddNewItem}
                                className={cn(
                                    'border-border/60 text-muted-foreground flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-2 py-3 text-sm font-medium transition-colors',
                                    !canEdit
                                        ? 'cursor-not-allowed opacity-50'
                                        : 'hover:border-primary/50 hover:bg-muted/40 hover:text-foreground cursor-pointer',
                                )}
                            >
                                <PlusIcon className="size-4" />
                                Add new reason
                            </button>
                        </li>
                    </DndSortableGroup>
                ) : null}
            </div>

            <BanTemplatesInputDialog
                key={reasonInputDialogData?.id}
                reasonData={reasonInputDialogData}
                onSave={handleOnSave}
                isDialogOpen={isDialogOpen}
                setIsDialogOpen={setIsDialogOpen}
            />
        </div>
    );
}
