import { useEffect, useMemo, useReducer, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LayoutTemplateIcon, Download, Upload } from 'lucide-react';
import InlineCode from '@/components/InlineCode';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    reconcileCardPendingSave,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { txToast } from '@/components/TxToaster';
import {
    applySharedPlaceholdersToDeferralConfig,
    DEFERRAL_SCENARIO_META,
    normalizeDeferralCardsConfig,
    resolveDeferralDiscordInvite,
    type DeferralCardsConfig,
    type DeferralScenarioId,
} from '@shared/deferralCardTypes';
import { canonicalDeferralCardsForDiff, prepareDeferralCardsForSave } from '@shared/deferralCardRender';
import { dequal } from 'dequal/lite';
import { exportDeferralCardsFull, importDeferralCardFile } from '@shared/deferralCardExport';
import { DeferralPlaceholdersEditor } from '../deferral/DeferralPlaceholdersEditor';
import { useOpenDeferralEditor } from '../deferralEditorState';
import { useLocale } from '@/hooks/locale';
import { useDeferralAddonMeta } from '@/hooks/deferralAddonMeta';

export const pageConfigs = {
    deferralCards: getPageConfig('whitelist', 'deferralCards'),
} as const;

const DEFAULT_STUDIO_SCENARIO: DeferralScenarioId = 'whitelist_pending';

function buildDeferralCardsConfig(raw: DeferralCardsConfig | undefined): DeferralCardsConfig {
    return normalizeDeferralCardsConfig(raw);
}

function downloadJson(payload: unknown, filename: string) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

export default function ConfigCardDeferralCards({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const { meta: addonDeferralMeta } = useDeferralAddonMeta();
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const openDeferralEditor = useOpenDeferralEditor();
    const importInputRef = useRef<HTMLInputElement>(null);

    const deferralCards = useMemo(
        () => buildDeferralCardsConfig(states.deferralCards as DeferralCardsConfig | undefined),
        [states.deferralCards],
    );

    useEffect(() => {
        updatePageState();
    }, [states]);

    const setDeferralCardsState = (next: DeferralCardsConfig) => {
        cfg.deferralCards.state.set(next);
    };

    const updatePageState = () => {
        const storedCanonical = canonicalDeferralCardsForDiff(cfg.deferralCards.initialValue);
        const currentCanonical = canonicalDeferralCardsForDiff(states.deferralCards);
        const hasChanges = !dequal(storedCanonical, currentCanonical);

        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, hasChanges));

        let cardsForSave: DeferralCardsConfig;
        try {
            cardsForSave = prepareDeferralCardsForSave(
                applySharedPlaceholdersToDeferralConfig(
                    buildDeferralCardsConfig(states.deferralCards as DeferralCardsConfig | undefined),
                ),
            );
        } catch {
            cardsForSave = currentCanonical;
        }

        return {
            hasChanges,
            localConfigs: { whitelist: { deferralCards: cardsForSave } } as const,
        };
    };

    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        const wl = localConfigs.whitelist;
        for (const { id } of DEFERRAL_SCENARIO_META) {
            const body = wl?.deferralCards?.scenarios?.[id]?.bodyTemplate;
            if (body && body.length > 2048) {
                return txToast.error({
                    title: t('panel.settings.deferral.body_too_long_title'),
                    msg: t('panel.settings.deferral.body_too_long_msg', { id }),
                });
            }
        }

        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    const handleOpenStudio = () => {
        openDeferralEditor({
            scenarioId: DEFAULT_STUDIO_SCENARIO,
            deferralCards: applySharedPlaceholdersToDeferralConfig(deferralCards),
        });
    };

    const handleExportAll = () => {
        downloadJson(exportDeferralCardsFull(deferralCards), 'deferral-cards-all.json');
        txToast.success({
            title: t('panel.toasts.card_exported'),
            msg: t('panel.settings.deferral.cards_exported_msg'),
        });
    };

    const handleImportFile = async (file: File) => {
        try {
            const result = importDeferralCardFile(deferralCards, JSON.parse(await file.text()), {
                installedAddonIds: addonDeferralMeta.installedAddonIds,
            });
            if (!result.ok) {
                txToast.error({ title: t('panel.toasts.import_failed'), msg: result.error });
                return;
            }
            setDeferralCardsState(normalizeDeferralCardsConfig(result.config));
            updatePageState();
            const count = result.importedScenarios.length + result.importedAddonScenarios.length;
            txToast.success({
                title: t('panel.settings.deferral.imported_title'),
                msg: t('panel.settings.deferral.imported_msg', { count }),
            });
            if (result.skippedAddonScenarios.length) {
                txToast.warning({
                    title: t('panel.settings.deferral.addon_skipped_title'),
                    msg: result.skippedAddonScenarios.join(', '),
                });
            }
        } catch {
            txToast.error({ title: t('panel.toasts.import_failed'), msg: t('panel.settings.deferral.invalid_json') });
        }
    };

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label={t('panel.settings.deferral.about_label')}>
                <SettingItemDesc>{t('panel.settings.deferral.about_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.deferral.discord_invite_label')}>
                <Input
                    id="deferral-discord-invite"
                    className="max-w-md"
                    value={deferralCards.discordInvite ?? ''}
                    placeholder={t('panel.settings.deferral.discord_invite_placeholder')}
                    disabled={pageCtx.isReadOnly}
                    onChange={(e) =>
                        setDeferralCardsState({
                            ...deferralCards,
                            discordInvite: e.target.value,
                        })
                    }
                />
                <SettingItemDesc>
                    {t('panel.settings.deferral.discord_invite_desc')} <InlineCode>{'{discordInvite}'}</InlineCode>.{' '}
                    {t('panel.settings.deferral.discord_invite_preview')} {resolveDeferralDiscordInvite(deferralCards)}
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.deferral.custom_placeholders_label')}>
                <DeferralPlaceholdersEditor
                    placeholders={deferralCards.sharedCustomPlaceholders ?? []}
                    dynamicTokens={addonDeferralMeta.tokens}
                    onChange={(sharedCustomPlaceholders) => {
                        setDeferralCardsState({
                            ...deferralCards,
                            sharedCustomPlaceholders,
                        });
                    }}
                />
                <SettingItemDesc>
                    {t('panel.settings.deferral.custom_placeholders_desc')} <InlineCode>{'{key}'}</InlineCode>
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.deferral.studio_label')}>
                <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={pageCtx.isReadOnly}
                    onClick={handleOpenStudio}
                >
                    <LayoutTemplateIcon className="mr-1.5 size-4" />
                    {t('panel.settings.deferral.open_studio')}
                </Button>
                <SettingItemDesc>{t('panel.settings.deferral.studio_desc')}</SettingItemDesc>
            </SettingItem>

            <SettingItem label={t('panel.settings.deferral.import_export_label')}>
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={handleExportAll}>
                        <Download className="mr-1.5 size-4" />
                        {t('panel.settings.deferral.export_all')}
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pageCtx.isReadOnly}
                        onClick={() => importInputRef.current?.click()}
                    >
                        <Upload className="mr-1.5 size-4" />
                        {t('panel.settings.deferral.import')}
                    </Button>
                </div>
                <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleImportFile(file);
                    }}
                />
                <SettingItemDesc>{t('panel.settings.deferral.import_export_desc')}</SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
