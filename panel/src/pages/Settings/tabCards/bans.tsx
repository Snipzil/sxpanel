import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { PencilIcon } from 'lucide-react';
import SwitchText from '@/components/SwitchText';
import { AdvancedDivider, SettingItem, SettingItemDesc } from '../settingsItems';
import { AutosizeTextarea, AutosizeTextAreaRef } from '@/components/ui/autosize-textarea';
import { useState, useEffect, useRef, useMemo, useReducer } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
    reconcileCardPendingSave,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { txToast } from '@/components/TxToaster';
import { useLocale } from '@/hooks/locale';

export const pageConfigs = {
    checkingEnabled: getPageConfig('banlist', 'enabled', undefined, true),
    rejectionMessage: getPageConfig('banlist', 'rejectionMessage'),

    requiredHwids: getPageConfig('banlist', 'requiredHwidMatches', true),
} as const;

export default function ConfigCardBans({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    //Effects - handle changes and reset advanced settings
    useEffect(() => {
        updatePageState();
    }, [states]);
    useEffect(() => {
        if (showAdvanced) return;
        Object.values(cfg).forEach((c) => c.isAdvanced && c.state.discard());
    }, [showAdvanced]);

    //Refs for configs that don't use state
    const rejectionMessageRef = useRef<AutosizeTextAreaRef | null>(null);

    //Marshalling Utils
    const selectNumberUtil = {
        toUi: (num?: number) => (num ? num.toString() : undefined),
        toCfg: (str?: string) => (str ? parseInt(str) : undefined),
    };

    //Processes the state of the page and sets the card as pending save if needed
    const updatePageState = () => {
        const overwrites = {
            rejectionMessage: rejectionMessageRef.current?.textArea.value,
        };

        const res = getConfigDiff(cfg, states, overwrites, showAdvanced);
        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, res.hasChanges));
        return res;
    };

    //Validate changes (for UX only) and trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        if (localConfigs.banlist?.rejectionMessage && localConfigs.banlist.rejectionMessage.length > 512) {
            return txToast.error({
                title: t('panel.settings.bans.rejection_too_big_title'),
                md: true,
                msg: t('panel.settings.bans.rejection_too_big_msg'),
            });
        }
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell
            cardCtx={cardCtx}
            pageCtx={pageCtx}
            onClickSave={handleOnSave}
            advancedVisible={showAdvanced}
            advancedSetter={setShowAdvanced}
        >
            <SettingItem label={t('panel.settings.bans.checking_label')}>
                <SwitchText
                    id={cfg.checkingEnabled.eid}
                    checkedLabel={t('panel.settings.switch.enabled')}
                    uncheckedLabel={t('panel.settings.switch.disabled')}
                    checked={states.checkingEnabled}
                    onCheckedChange={cfg.checkingEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.bans.checking_desc')} <br />
                    <strong>{t('panel.settings.bans.note_label')}</strong> {t('panel.settings.bans.checking_note')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.bans.templates_label')}>
                <Link asChild href="/settings/ban-templates">
                    <Button size={'sm'} variant="secondary" disabled={pageCtx.isReadOnly}>
                        <PencilIcon className="mr-1.5 inline-block size-4" /> {t('panel.settings.bans.edit_templates')}
                    </Button>
                </Link>
                <SettingItemDesc>{t('panel.settings.bans.templates_desc')}</SettingItemDesc>
            </SettingItem>
            <SettingItem
                label={t('panel.settings.bans.rejection_label')}
                htmlFor={cfg.rejectionMessage.eid}
                showOptional
            >
                <AutosizeTextarea
                    id={cfg.rejectionMessage.eid}
                    ref={rejectionMessageRef}
                    placeholder={t('panel.settings.bans.rejection_placeholder')}
                    defaultValue={cfg.rejectionMessage.initialValue}
                    onInput={updatePageState}
                    autoComplete="off"
                    minHeight={60}
                    maxHeight={180}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.bans.rejection_desc')} <br />
                    {t('panel.settings.bans.rejection_appeal')}
                </SettingItemDesc>
            </SettingItem>

            {showAdvanced && <AdvancedDivider />}

            <SettingItem
                label={t('panel.settings.bans.hwid_label')}
                htmlFor={cfg.requiredHwids.eid}
                showIf={showAdvanced}
            >
                <Select
                    value={selectNumberUtil.toUi(states.requiredHwids)}
                    onValueChange={(val) => cfg.requiredHwids.state.set(selectNumberUtil.toCfg(val))}
                    disabled={pageCtx.isReadOnly}
                >
                    <SelectTrigger id={cfg.requiredHwids.eid}>
                        <SelectValue placeholder={t('panel.common.select_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">{t('panel.settings.bans.hwid_option_1')}</SelectItem>
                        <SelectItem value="2">{t('panel.settings.bans.hwid_option_2')}</SelectItem>
                        <SelectItem value="3">{t('panel.settings.bans.hwid_option_3')}</SelectItem>
                        <SelectItem value="4">{t('panel.settings.bans.hwid_option_4')}</SelectItem>
                        <SelectItem value="0">{t('panel.settings.bans.hwid_option_0')}</SelectItem>
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    {t('panel.settings.bans.hwid_desc')} <br />
                    {t('panel.settings.bans.hwid_note')}
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
