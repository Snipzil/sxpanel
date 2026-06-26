import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import InlineCode from '@/components/InlineCode';

import { useLocale } from '@/hooks/locale';

import type { DeferralCustomPlaceholder } from '@shared/deferralCardLayout';

import { DEFERRAL_BUILTIN_TOKEN_KEYS } from '@shared/deferralCardLayout';

import type { DeferralAddonTokenMeta } from '@shared/deferralAddonTypes';

import { Plus, Trash2 } from 'lucide-react';

type DeferralPlaceholdersEditorProps = {
    placeholders: DeferralCustomPlaceholder[];

    dynamicTokens?: DeferralAddonTokenMeta[];

    onChange: (placeholders: DeferralCustomPlaceholder[]) => void;
};

export function DeferralPlaceholdersEditor({
    placeholders,

    dynamicTokens = [],

    onChange,
}: DeferralPlaceholdersEditorProps) {
    const { t } = useLocale();

    const handleAdd = () => {
        onChange([
            ...placeholders,

            {
                key: `custom${placeholders.length + 1}`,

                label: t('panel.deferral_studio.placeholders_editor.default_custom_label'),

                value: '',
            },
        ]);
    };

    const handleUpdate = (index: number, patch: Partial<DeferralCustomPlaceholder>) => {
        onChange(placeholders.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    };

    const handleRemove = (index: number) => {
        onChange(placeholders.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col gap-3">
            <div>
                <p className="text-foreground text-sm font-medium">
                    {t('panel.deferral_studio.placeholders_editor.builtin_title')}
                </p>

                <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-1 gap-y-1 text-xs">
                    {DEFERRAL_BUILTIN_TOKEN_KEYS.map((k) => (
                        <InlineCode key={k}>{`{${k}}`}</InlineCode>
                    ))}

                    <InlineCode>&lt;codeid&gt;</InlineCode>

                    <InlineCode>&lt;guildname&gt;</InlineCode>
                </p>
            </div>

            {dynamicTokens.length > 0 ? (
                <div>
                    <p className="text-foreground text-sm font-medium">
                        {t('panel.deferral_studio.placeholders_editor.addon_title')}
                    </p>

                    <p className="text-muted-foreground mt-1 text-xs">
                        {t('panel.deferral_studio.placeholders_editor.addon_desc')} <InlineCode>{'{key}'}</InlineCode>.
                    </p>

                    <ul className="mt-2 flex flex-col gap-1.5">
                        {dynamicTokens.map((row) => (
                            <li
                                key={`${row.addonId}-${row.key}`}
                                className="border-border/60 bg-muted/10 flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-xs"
                            >
                                <InlineCode>{`{${row.key}}`}</InlineCode>

                                <span className="text-muted-foreground">{row.label}</span>

                                <span className="text-muted-foreground ml-auto">{row.addonId}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-foreground text-sm font-medium">
                        {t('panel.deferral_studio.placeholders_editor.custom_title')}
                    </p>

                    <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
                        <Plus className="mr-1 size-4" />

                        {t('panel.deferral_studio.placeholders_editor.add')}
                    </Button>
                </div>

                {placeholders.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                        {t('panel.deferral_studio.placeholders_editor.empty')}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-2">
                        {placeholders.map((row, index) => (
                            <li
                                key={`${row.key}-${index}`}
                                className="border-border/60 bg-muted/10 grid gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                            >
                                <Input
                                    aria-label={t('panel.deferral_studio.placeholders_editor.key_aria')}
                                    value={row.key}
                                    placeholder={t('panel.deferral_studio.placeholders_editor.key_placeholder')}
                                    onChange={(e) => handleUpdate(index, { key: e.target.value.replace(/[{}]/g, '') })}
                                />

                                <Input
                                    aria-label={t('panel.deferral_studio.placeholders_editor.label_aria')}
                                    value={row.label}
                                    placeholder={t('panel.deferral_studio.placeholders_editor.label_placeholder')}
                                    onChange={(e) => handleUpdate(index, { label: e.target.value })}
                                />

                                <Input
                                    aria-label={t('panel.deferral_studio.placeholders_editor.value_aria')}
                                    value={row.value}
                                    placeholder={t('panel.deferral_studio.placeholders_editor.value_placeholder')}
                                    onChange={(e) => handleUpdate(index, { value: e.target.value })}
                                />

                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t('panel.deferral_studio.placeholders_editor.remove_aria')}
                                    onClick={() => handleRemove(index)}
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
