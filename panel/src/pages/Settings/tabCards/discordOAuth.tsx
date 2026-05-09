import { Input } from '@/components/ui/input';
import TxAnchor from '@/components/TxAnchor';
import InlineCode from '@/components/InlineCode';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useEffect, useRef, useMemo, useReducer } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';

export const pageConfigs = {
    oauthClientId: getPageConfig('discordBot', 'oauthClientId'),
    oauthClientSecret: getPageConfig('discordBot', 'oauthClientSecret'),
} as const;

export default function ConfigCardDiscordOAuth({ cardCtx, pageCtx }: SettingsCardProps) {
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    //Effects - handle changes
    useEffect(() => {
        updatePageState();
    }, [states]);

    //Refs for configs that don't use state
    const oauthClientIdRef = useRef<HTMLInputElement | null>(null);
    const oauthClientSecretRef = useRef<HTMLInputElement | null>(null);

    //Marshalling Utils
    const emptyToNull = (str?: string) => {
        if (str === undefined) return undefined;
        const trimmed = str.trim();
        return trimmed.length ? trimmed : null;
    };

    //Processes the state of the page and sets the card as pending save if needed
    const updatePageState = () => {
        const overwrites = {
            oauthClientId: emptyToNull(oauthClientIdRef.current?.value),
            oauthClientSecret: emptyToNull(oauthClientSecretRef.current?.value),
        };

        const res = getConfigDiff(cfg, states, overwrites, false);
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    };

    //Trigger the save API
    const handleOnSave = () => {
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label="Client ID" htmlFor={cfg.oauthClientId.eid} showOptional>
                <Input
                    id={cfg.oauthClientId.eid}
                    ref={oauthClientIdRef}
                    defaultValue={cfg.oauthClientId.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="000000000000000000"
                />
                <SettingItemDesc>
                    The Client/Application ID from your Discord application. Required alongside the Client Secret to
                    enable the &quot;Login with Discord&quot; button on the login page. <br />
                    Get it from the{' '}
                    <TxAnchor href="https://discord.com/developers/applications">
                        Discord Developer Portal
                    </TxAnchor>{' '}
                    under your application&apos;s OAuth2 settings. <br />
                    <strong>Note:</strong> You can reuse the same application as your bot.
                </SettingItemDesc>
            </SettingItem>
            <SettingItem label="Client Secret" htmlFor={cfg.oauthClientSecret.eid} showOptional>
                <Input
                    id={cfg.oauthClientSecret.eid}
                    ref={oauthClientSecretRef}
                    defaultValue={cfg.oauthClientSecret.initialValue}
                    onInput={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    autoComplete="off"
                    className="blur-input"
                />
                <SettingItemDesc>
                    The Client Secret from your Discord application&apos;s OAuth2 page. <br />
                    <strong>Important:</strong> You must add{' '}
                    <InlineCode>{'<your-panel-url>/login/discord/callback'}</InlineCode> as a redirect URL in the
                    Discord Developer Portal.
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
