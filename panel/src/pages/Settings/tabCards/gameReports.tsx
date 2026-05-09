import SwitchText from '@/components/SwitchText';
import { SettingItem, SettingItemDesc } from '../settingsItems';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
    getConfigEmptyState,
    getConfigAccessors,
    SettingsCardProps,
    getPageConfig,
    configsReducer,
    getConfigDiff,
} from '../utils';
import SettingsCardShell from '../SettingsCardShell';
import { Input } from '@/components/ui/input';
import { txToast } from '@/components/TxToaster';

export const pageConfigs = {
    reportsEnabled: getPageConfig('gameFeatures', 'reportsEnabled', undefined, true),
    ticketPriorityEnabled: getPageConfig('gameFeatures', 'ticketPriorityEnabled', undefined, false),
    ticketFeedbackEnabled: getPageConfig('gameFeatures', 'ticketFeedbackEnabled', undefined, true),
    ticketCategories: getPageConfig('gameFeatures', 'ticketCategories', undefined, [
        'Player Report',
        'Bug Report',
        'Question',
        'Other',
    ] as string[]),
    ticketRetentionDays: getPageConfig('gameFeatures', 'ticketRetentionDays', undefined, 30),
    ticketChannelId: getPageConfig('discordBot', 'ticketChannelId', undefined, null as string | null),
} as const;

export default function ConfigCardGameReports({ cardCtx, pageCtx }: SettingsCardProps) {
    const [states, dispatch] = useReducer(configsReducer<typeof pageConfigs>, null, () =>
        getConfigEmptyState(pageConfigs),
    );
    const cfg = useMemo(() => {
        return getConfigAccessors(cardCtx.cardId, pageConfigs, pageCtx.apiData, dispatch);
    }, [pageCtx.apiData, dispatch]);

    const categoriesRef = useRef<HTMLInputElement | null>(null);
    const retentionDaysRef = useRef<HTMLInputElement | null>(null);
    const ticketChannelRef = useRef<HTMLInputElement | null>(null);

    // Set initial ref values from API data when it loads
    useEffect(() => {
        if (!pageCtx.apiData) return;
        const stored = pageCtx.apiData.storedConfigs as any;
        const defaults = pageCtx.apiData.defaultConfigs as any;
        const cats = stored?.gameFeatures?.ticketCategories ?? defaults?.gameFeatures?.ticketCategories ?? [];
        const ret = stored?.gameFeatures?.ticketRetentionDays ?? defaults?.gameFeatures?.ticketRetentionDays ?? 30;
        const chan = stored?.discordBot?.ticketChannelId ?? defaults?.discordBot?.ticketChannelId ?? '';
        if (categoriesRef.current) categoriesRef.current.value = cats.join(', ');
        if (retentionDaysRef.current) retentionDaysRef.current.value = String(ret);
        if (ticketChannelRef.current) ticketChannelRef.current.value = chan ?? '';
    }, [pageCtx.apiData]);

    const updatePageState = useCallback(() => {
        const rawCategories = categoriesRef.current?.value ?? '';
        const categories = rawCategories
            .split(/[,;]\s*/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        const retDays = parseInt(retentionDaysRef.current?.value ?? '30', 10);
        const chanId = ticketChannelRef.current?.value.trim() || null;

        const overwrites = {
            ticketCategories: categories.length ? categories : undefined,
            ticketRetentionDays: Number.isFinite(retDays) ? retDays : undefined,
            ticketChannelId: chanId,
        } as any;

        const res = getConfigDiff(cfg, states, overwrites as any, false);
        pageCtx.setCardPendingSave(res.hasChanges ? cardCtx : null);
        return res;
    }, [cfg, states, pageCtx, cardCtx]);

    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const debouncedUpdatePageState = useCallback(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            updatePageState();
        }, 300);
    }, [updatePageState]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    useEffect(() => {
        updatePageState();
    }, [states, updatePageState]);

    const handleOnSave = () => {
        const retDays = parseInt(retentionDaysRef.current?.value ?? '30', 10);
        if (!Number.isFinite(retDays) || retDays < 1 || retDays > 365) {
            return txToast.error('Retention days must be a number between 1 and 365.');
        }
        const { hasChanges, localConfigs } = updatePageState();
        if (!hasChanges) return;
        pageCtx.saveChanges(cardCtx, localConfigs);
    };

    return (
        <SettingsCardShell cardCtx={cardCtx} pageCtx={pageCtx} onClickSave={handleOnSave}>
            <SettingItem label="Player Tickets">
                <SwitchText
                    id={cfg.reportsEnabled.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    variant="checkedGreen"
                    checked={states.reportsEnabled}
                    onCheckedChange={cfg.reportsEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    When enabled, players can use the <strong>/ticket</strong> command to submit support tickets that
                    admins can review in the Tickets page.
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Categories" htmlFor={`${cardCtx.cardId}-categories`} showOptional>
                <Input
                    id={`${cardCtx.cardId}-categories`}
                    ref={categoriesRef}
                    placeholder="Player Report, Bug Report, Question, Other"
                    onChange={debouncedUpdatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>Comma-separated list of ticket categories players can choose from.</SettingItemDesc>
            </SettingItem>

            <SettingItem label="Priority Selection">
                <SwitchText
                    id={cfg.ticketPriorityEnabled.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    variant="checkedGreen"
                    checked={states.ticketPriorityEnabled}
                    onCheckedChange={cfg.ticketPriorityEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    Allow players to set a priority level (Low, Medium, High, Critical) when submitting a ticket.
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Player Feedback">
                <SwitchText
                    id={cfg.ticketFeedbackEnabled.eid}
                    checkedLabel="Enabled"
                    uncheckedLabel="Disabled"
                    variant="checkedGreen"
                    checked={states.ticketFeedbackEnabled}
                    onCheckedChange={cfg.ticketFeedbackEnabled.state.set}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    When a ticket is resolved, prompt the player to rate their support experience.
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Retention Days" htmlFor={`${cardCtx.cardId}-retention`} showOptional>
                <Input
                    id={`${cardCtx.cardId}-retention`}
                    ref={retentionDaysRef}
                    type="number"
                    min={1}
                    max={365}
                    placeholder="30"
                    onChange={updatePageState}
                    disabled={pageCtx.isReadOnly}
                    className="w-24"
                />
                <SettingItemDesc>
                    How many days to keep resolved/closed tickets before they are automatically deleted. Default is 30
                    days.
                </SettingItemDesc>
            </SettingItem>

            <SettingItem label="Discord Channel ID" htmlFor={`${cardCtx.cardId}-discordChan`} showOptional>
                <Input
                    id={`${cardCtx.cardId}-discordChan`}
                    ref={ticketChannelRef}
                    placeholder="Discord channel snowflake ID"
                    onChange={updatePageState}
                    disabled={pageCtx.isReadOnly}
                />
                <SettingItemDesc>
                    When set, new tickets will create a Discord thread in this channel (requires Discord integration to
                    be enabled).
                </SettingItemDesc>
            </SettingItem>
        </SettingsCardShell>
    );
}
