import { Input } from '@/components/ui/input';
import SwitchText from '@/components/SwitchText';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useEffect, useRef, useMemo, useReducer } from 'react';
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
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import InlineCode from '@/components/InlineCode';
import TxAnchor from '@/components/TxAnchor';
import { txToast } from '@/components/TxToaster';
import { useAdminPerms } from '@/hooks/auth';
import { useLocale } from '@/hooks/locale';

const detectBrowserLanguage = () => {
    const txTopLocale = Array.isArray(window.txBrowserLocale) ? window.txBrowserLocale[0] : window.txBrowserLocale;
    try {
        return new Intl.Locale(txTopLocale).language;
    } catch (error) {}
    try {
        if (txTopLocale.includes('-')) {
            return txTopLocale.split('-')[0];
        }
    } catch (error) {}
    return undefined;
};

export const pageConfigs = {
    serverName: getPageConfig('general', 'serverName'),
    language: getPageConfig('general', 'language'),
    allowSelfIdentifierEdit: getPageConfig('general', 'allowSelfIdentifierEdit', undefined, false),
    requireAdminTwoFactor: getPageConfig('general', 'requireAdminTwoFactor', undefined, false),
} as const;

export default function ConfigCardGeneral({ cardCtx, pageCtx }: SettingsCardProps) {
    const { t } = useLocale();
    const { isMaster } = useAdminPerms();
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    useEffect(() => {
        updatePageState();
    }, [states]);

    const serverNameRef = useRef<HTMLInputElement | null>(null);

    const updatePageState = () => {
        const overwrites = {
            serverName: serverNameRef.current?.value,
        };

        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(reconcileCardPendingSave(cardCtx, res.hasChanges));
        return res;
    };

    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;

        if (!localConfigs.general?.serverName) {
            return txToast.error(t('panel.toasts.server_name_required'));
        }
        if (localConfigs.general?.serverName?.length > 18) {
            return txToast.error(t('panel.toasts.server_name_too_big'));
        }
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    const localeData = useMemo(() => {
        if (!pageCtx.apiData?.locales) return null;
        const browserLanguage = detectBrowserLanguage();
        let enData;
        let browserData;
        let otherData = [];
        for (const lang of pageCtx.apiData?.locales) {
            if (lang.code === 'en') {
                enData = lang;
            } else if (lang.code === browserLanguage) {
                browserData = {
                    code: lang.code,
                    label: `${lang.label} ${t('panel.settings.general.language.browser_suffix')}`,
                };
            } else {
                otherData.push(lang);
            }
        }
        return [
            enData,
            browserData,
            'sep1',
            ...otherData,
            'sep2',
            { code: 'custom', label: t('panel.settings.general.language.custom_option') },
        ].filter(Boolean);
    }, [pageCtx.apiData, t]);

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label={t('panel.settings.general.server_name.label')} htmlFor={cfg.serverName.eid} required>
                <Input
                    id={cfg.serverName.eid}
                    ref={serverNameRef}
                    defaultValue={cfg.serverName.initialValue}
                    placeholder={t('panel.settings.general.server_name.placeholder')}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    {t('panel.settings.general.server_name.desc')} <br />
                    {t('panel.settings.general.server_name.desc_length')}
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label={t('panel.settings.general.language.label')} htmlFor={cfg.language.eid} required>
                <Select
                    value={states.language}
                    onValueChange={cfg.language.state.set as any}
                    disabled={pageCtx.isReadOnly}
                >
                    <SelectTrigger id={cfg.language.eid}>
                        <SelectValue placeholder={t('panel.common.select_placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {localeData?.map((locale) =>
                            typeof locale === 'object' ? (
                                <SelectItem key={locale.code} value={locale.code}>
                                    {locale.label}
                                </SelectItem>
                            ) : (
                                <SelectSeparator key={locale} />
                            ),
                        )}
                    </SelectContent>
                </Select>
                <SettingItemDesc>
                    {t('panel.settings.general.language.desc')} <br />
                    {t('panel.settings.general.language.desc_custom')}{' '}
                    <InlineCode>{t('panel.settings.general.language.custom_inline')}</InlineCode>. <br />
                    {t('panel.settings.general.language.desc_docs')}{' '}
                    <TxAnchor href="https://sxpanel.org/docs/v0.6.0-Beta/translation">
                        {t('panel.settings.general.language.documentation_link')}
                    </TxAnchor>
                    .
                </SettingItemDesc>
            </SettingItem>
            {isMaster && (
                <>
                    <SettingItem
                        label={t('panel.settings.general.allow_self_identifier_edit.label')}
                        htmlFor={cfg.allowSelfIdentifierEdit.eid}
                    >
                        <SwitchText
                            id={cfg.allowSelfIdentifierEdit.eid}
                            checked={states.allowSelfIdentifierEdit}
                            onCheckedChange={cfg.allowSelfIdentifierEdit.state.set}
                            disabled={pageCtx.isReadOnly}
                            checkedLabel={t('panel.settings.switch.enabled')}
                            uncheckedLabel={t('panel.settings.switch.disabled')}
                        />
                        <SettingItemDesc>
                            {t('panel.settings.general.allow_self_identifier_edit.desc_enabled')} <br />
                            {t('panel.settings.general.allow_self_identifier_edit.desc_disabled')}
                        </SettingItemDesc>
                    </SettingItem>
                    <SettingItem
                        label={t('panel.settings.general.require_admin_two_factor.label')}
                        htmlFor={cfg.requireAdminTwoFactor.eid}
                    >
                        <SwitchText
                            id={cfg.requireAdminTwoFactor.eid}
                            checked={states.requireAdminTwoFactor}
                            onCheckedChange={cfg.requireAdminTwoFactor.state.set}
                            disabled={pageCtx.isReadOnly}
                            checkedLabel={t('panel.settings.switch.required')}
                            uncheckedLabel={t('panel.settings.switch.optional')}
                        />
                        <SettingItemDesc>
                            {t('panel.settings.general.require_admin_two_factor.desc')} <br />
                            {t('panel.settings.general.require_admin_two_factor.desc_master')}
                        </SettingItemDesc>
                    </SettingItem>
                </>
            )}
        </SettingsCardShell>
    );
}
