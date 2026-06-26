import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fetchDiscordGuildRoles } from '@/lib/discordGuildRoles';
import { isValidDiscordSnowflake, normalizeRoleIdsInput } from '@/lib/discordRoleIds';
import { useAuthedFetcher } from '@/hooks/fetch';
import { useLocale } from '@/hooks/locale';
import type { DiscordGuildRoleOption } from '@shared/discordGuildRoles';
import { ChevronDownIcon, RefreshCwIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DiscordRoleMultiSelectProps = {
    value: string[];
    onChange: (roleIds: string[]) => void;
    disabled?: boolean;
    id?: string;
};

const shortenRoleId = (roleId: string) => {
    if (roleId.length <= 12) return roleId;
    return `${roleId.slice(0, 4)}…${roleId.slice(-4)}`;
};

type DiscordRoleOptionRowProps = {
    role: DiscordGuildRoleOption;
    checked: boolean;
    disabled?: boolean;
    checkboxId: string;
    onToggle: (roleId: string, checked: boolean) => void;
};

const DiscordRoleOptionRow = memo(function DiscordRoleOptionRow({
    role,
    checked,
    disabled,
    checkboxId,
    onToggle,
}: DiscordRoleOptionRowProps) {
    return (
        <div className="hover:bg-muted/50 flex items-center gap-2 rounded px-1 py-1">
            <Checkbox
                id={checkboxId}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => onToggle(role.id, next === true)}
            />
            <Label htmlFor={checkboxId} className="flex flex-1 cursor-pointer items-center gap-2 font-normal">
                {role.color ? (
                    <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: role.color }}
                        aria-hidden
                    />
                ) : null}
                <span className="truncate">{role.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">{shortenRoleId(role.id)}</span>
            </Label>
        </div>
    );
});

export function DiscordRoleMultiSelect({ value, onChange, disabled, id }: DiscordRoleMultiSelectProps) {
    const { t } = useLocale();
    const authedFetcher = useAuthedFetcher();
    const authedFetcherRef = useRef(authedFetcher);
    authedFetcherRef.current = authedFetcher;

    const [roles, setRoles] = useState<DiscordGuildRoleOption[]>([]);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [manualInput, setManualInput] = useState('');
    const [useManualFallback, setUseManualFallback] = useState(false);

    const loadRoles = useCallback(async (forceRefresh = false) => {
        setIsLoading(true);
        try {
            const result = await fetchDiscordGuildRoles(authedFetcherRef.current, forceRefresh);
            setRoles(result.roles);
            setFetchError(result.error);
            setUseManualFallback(result.roles.length === 0 && !!result.error);
        } catch {
            setFetchError('Failed to load Discord roles.');
            setUseManualFallback(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (disabled) return;
        loadRoles().catch(() => {});
    }, [disabled, loadRoles]);

    useEffect(() => {
        if (useManualFallback) {
            setManualInput(value.join('\n'));
        }
    }, [useManualFallback, value]);

    const roleById = useMemo(() => new Map(roles.map((role) => [role.id, role])), [roles]);
    const selectedRoleIds = useMemo(() => new Set(value), [value]);

    const filteredRoles = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query.length) return roles;
        return roles.filter((role) => role.name.toLowerCase().includes(query) || role.id.includes(query));
    }, [roles, search]);

    const handleToggleRole = useCallback(
        (roleId: string, checked: boolean) => {
            if (disabled) return;
            if (checked) {
                onChange([...new Set([...value, roleId])]);
                return;
            }
            onChange(value.filter((entry) => entry !== roleId));
        },
        [disabled, onChange, value],
    );

    const handleManualBlur = () => {
        const next = normalizeRoleIdsInput(manualInput);
        onChange(next);
    };

    if (useManualFallback) {
        return (
            <div className="space-y-2">
                <Textarea
                    id={id}
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onBlur={handleManualBlur}
                    disabled={disabled}
                    placeholder={t('panel.settings.discord_roles_picker.manual_placeholder')}
                    rows={3}
                />
                {fetchError ? <p className="text-muted-foreground text-xs">{fetchError}</p> : null}
                {!disabled && roles.length > 0 ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setUseManualFallback(false)}>
                        {t('panel.settings.discord_roles_picker.use_picker')}
                    </Button>
                ) : null}
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {value.length ? (
                    value.map((roleId) => {
                        const role = roleById.get(roleId);
                        const label =
                            role?.name ??
                            t('panel.settings.discord_roles_picker.unknown_role', { roleId: shortenRoleId(roleId) });
                        return (
                            <Badge
                                key={roleId}
                                variant="secondary"
                                className="gap-1 pr-1"
                                style={role?.color ? { borderColor: role.color, color: role.color } : undefined}
                            >
                                {role?.color ? (
                                    <span
                                        className="inline-block size-2 rounded-full"
                                        style={{ backgroundColor: role.color }}
                                        aria-hidden
                                    />
                                ) : null}
                                <span>{label}</span>
                                {!disabled ? (
                                    <button
                                        type="button"
                                        className="hover:bg-muted rounded px-1 text-xs"
                                        aria-label={t('panel.settings.discord_roles_picker.remove_role', { label })}
                                        onClick={() => handleToggleRole(roleId, false)}
                                    >
                                        ×
                                    </button>
                                ) : null}
                            </Badge>
                        );
                    })
                ) : (
                    <span className="text-muted-foreground text-sm">
                        {t('panel.settings.discord_roles_picker.none_selected')}
                    </span>
                )}
            </div>

            <div className="rounded-md border">
                <div className="flex items-center gap-2 border-b p-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex-1 justify-between"
                        disabled={disabled || isLoading}
                        onClick={() => setIsOpen((open) => !open)}
                        id={id}
                        aria-expanded={isOpen}
                    >
                        <span>
                            {isLoading
                                ? t('panel.settings.discord_roles_picker.loading')
                                : t('panel.settings.discord_roles_picker.choose_roles')}
                        </span>
                        <ChevronDownIcon className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={disabled || isLoading}
                        aria-label={t('panel.settings.discord_roles_picker.refresh')}
                        onClick={() => loadRoles(true)}
                    >
                        <RefreshCwIcon className="size-4" />
                    </Button>
                </div>

                {isOpen ? (
                    <div className="space-y-2 p-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('panel.settings.discord_roles_picker.search_placeholder')}
                            disabled={disabled}
                        />
                        <div className="max-h-48 overflow-y-auto overscroll-contain">
                            <div className="space-y-1 pr-2">
                                {filteredRoles.length ? (
                                    filteredRoles.map((role) => (
                                        <DiscordRoleOptionRow
                                            key={role.id}
                                            role={role}
                                            checked={selectedRoleIds.has(role.id)}
                                            disabled={disabled}
                                            checkboxId={`${id ?? 'discord-role'}-${role.id}`}
                                            onToggle={handleToggleRole}
                                        />
                                    ))
                                ) : (
                                    <p className="text-muted-foreground px-1 py-2 text-sm">
                                        {isLoading
                                            ? t('panel.settings.discord_roles_picker.loading')
                                            : t('panel.settings.discord_roles_picker.no_roles')}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            {fetchError ? <p className="text-muted-foreground text-xs">{fetchError}</p> : null}

            {!disabled ? (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => setUseManualFallback(true)}
                >
                    {t('panel.settings.discord_roles_picker.manual_entry')}
                </Button>
            ) : null}
        </div>
    );
}

export { isValidDiscordSnowflake, normalizeRoleIdsInput };
