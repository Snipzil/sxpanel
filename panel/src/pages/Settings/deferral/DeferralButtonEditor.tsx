import { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

import { useLocale } from '@/hooks/locale';

import {
    DEFAULT_DEFERRAL_BUTTON_CONTENT,
    normalizeDeferralButtonColorForPicker,
    parseDeferralButtonContent,
    serializeDeferralButtonContent,
    type DeferralButtonContent,
} from '@shared/deferralCardButton';

type DeferralButtonEditorProps = {
    content: string | undefined;

    onChange: (serialized: string) => void;
};

export function DeferralButtonEditor({ content, onChange }: DeferralButtonEditorProps) {
    const { t } = useLocale();

    const [draft, setDraft] = useState(() => parseDeferralButtonContent(content));

    const lastEmittedRef = useRef(serializeDeferralButtonContent(draft, { sanitizeColors: false }));

    useEffect(() => {
        const incoming = content ?? '';

        if (incoming === lastEmittedRef.current) return;

        const parsed = parseDeferralButtonContent(incoming);

        setDraft(parsed);

        lastEmittedRef.current = serializeDeferralButtonContent(parsed, { sanitizeColors: false });
    }, [content]);

    const commit = (next: DeferralButtonContent) => {
        setDraft(next);

        const serialized = serializeDeferralButtonContent(next, { sanitizeColors: false });

        lastEmittedRef.current = serialized;

        onChange(serialized);
    };

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <label className="text-muted-foreground text-xs font-medium" htmlFor="deferral-btn-label">
                    {t('panel.deferral_studio.button_editor.label')}
                </label>

                <Input
                    id="deferral-btn-label"
                    value={draft.label}
                    placeholder={t('panel.deferral_studio.button_editor.label_placeholder')}
                    onChange={(e) => commit({ ...draft, label: e.target.value })}
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-muted-foreground text-xs font-medium" htmlFor="deferral-btn-url">
                    {t('panel.deferral_studio.button_editor.url')}
                </label>

                <Input
                    id="deferral-btn-url"
                    value={draft.url}
                    placeholder={t('panel.deferral_studio.button_editor.url_placeholder')}
                    onChange={(e) => commit({ ...draft, url: e.target.value })}
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-muted-foreground text-xs font-medium" htmlFor="deferral-btn-bg">
                        {t('panel.deferral_studio.button_editor.background')}
                    </label>

                    <div className="flex items-center gap-2">
                        <input
                            id="deferral-btn-bg"
                            type="color"
                            value={normalizeDeferralButtonColorForPicker(
                                draft.backgroundColor,

                                DEFAULT_DEFERRAL_BUTTON_CONTENT.backgroundColor,
                            )}
                            onChange={(e) => commit({ ...draft, backgroundColor: e.target.value })}
                            className="size-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />

                        <Input
                            value={draft.backgroundColor}
                            onChange={(e) => commit({ ...draft, backgroundColor: e.target.value })}
                            className="font-mono text-xs"
                            placeholder="#5865F2"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-muted-foreground text-xs font-medium" htmlFor="deferral-btn-text">
                        {t('panel.deferral_studio.button_editor.text_color')}
                    </label>

                    <div className="flex items-center gap-2">
                        <input
                            id="deferral-btn-text"
                            type="color"
                            value={normalizeDeferralButtonColorForPicker(
                                draft.textColor,

                                DEFAULT_DEFERRAL_BUTTON_CONTENT.textColor,
                            )}
                            onChange={(e) => commit({ ...draft, textColor: e.target.value })}
                            className="size-9 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
                        />

                        <Input
                            value={draft.textColor}
                            onChange={(e) => commit({ ...draft, textColor: e.target.value })}
                            className="font-mono text-xs"
                            placeholder="#ffffff"
                        />
                    </div>
                </div>
            </div>

            <p className="text-muted-foreground text-xs">{t('panel.deferral_studio.button_editor.hint')}</p>
        </div>
    );
}
