import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { PlusIcon, Trash2Icon } from 'lucide-react';

import type { WhitelistSchedule, WhitelistScheduleWindow } from '@shared/whitelistTypes';

import { useLocale } from '@/hooks/locale';

const TIMEZONE_OPTIONS = [
    'UTC',

    'America/New_York',

    'America/Chicago',

    'America/Denver',

    'America/Los_Angeles',

    'Europe/London',

    'Europe/Paris',

    'Europe/Berlin',

    'Asia/Tokyo',

    'Australia/Sydney',
];

type WhitelistScheduleEditorProps = {
    schedule: WhitelistSchedule;

    disabled?: boolean;

    onChange: (schedule: WhitelistSchedule) => void;
};

export function WhitelistScheduleEditor({ schedule, disabled, onChange }: WhitelistScheduleEditorProps) {
    const { t } = useLocale();

    const dayLabels = [
        t('panel.settings.whitelist.schedule_day_sunday'),

        t('panel.settings.whitelist.schedule_day_monday'),

        t('panel.settings.whitelist.schedule_day_tuesday'),

        t('panel.settings.whitelist.schedule_day_wednesday'),

        t('panel.settings.whitelist.schedule_day_thursday'),

        t('panel.settings.whitelist.schedule_day_friday'),

        t('panel.settings.whitelist.schedule_day_saturday'),
    ];

    const handleWindowChange = (index: number, patch: Partial<WhitelistScheduleWindow>) => {
        const windows = schedule.windows.map((w, i) => (i === index ? { ...w, ...patch } : w));

        onChange({ ...schedule, windows });
    };

    const handleAddWindow = () => {
        onChange({
            ...schedule,

            windows: [...schedule.windows, { dayOfWeek: 1, startHour: 18, endHour: 23 }],
        });
    };

    const handleRemoveWindow = (index: number) => {
        onChange({ ...schedule, windows: schedule.windows.filter((_, i) => i !== index) });
    };

    return (
        <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="text-muted-foreground text-xs font-medium">
                    {t('panel.settings.whitelist.schedule_timezone')}
                </span>

                <Select
                    value={schedule.timezone || 'UTC'}
                    onValueChange={(timezone) => onChange({ ...schedule, timezone })}
                    disabled={disabled}
                >
                    <SelectTrigger className="sm:w-64">
                        <SelectValue placeholder={t('panel.settings.whitelist.schedule_timezone')} />
                    </SelectTrigger>

                    <SelectContent>
                        {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                                {tz}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {schedule.windows.map((window, index) => (
                <div
                    key={`${window.dayOfWeek}-${window.startHour}-${index}`}
                    className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border p-2"
                >
                    <Select
                        value={String(window.dayOfWeek)}
                        onValueChange={(v) => handleWindowChange(index, { dayOfWeek: parseInt(v, 10) })}
                        disabled={disabled}
                    >
                        <SelectTrigger className="w-36">
                            <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                            {dayLabels.map((label, day) => (
                                <SelectItem key={day} value={String(day)}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Input
                        type="number"
                        min={0}
                        max={23}
                        value={String(window.startHour)}
                        onChange={(e) => handleWindowChange(index, { startHour: parseInt(e.target.value, 10) || 0 })}
                        disabled={disabled}
                        className="w-20"
                        aria-label={t('panel.settings.whitelist.schedule_start_hour')}
                    />

                    <span className="text-muted-foreground text-xs">
                        {t('panel.settings.whitelist.schedule_hour_range')}
                    </span>

                    <Input
                        type="number"
                        min={0}
                        max={23}
                        value={String(window.endHour)}
                        onChange={(e) => handleWindowChange(index, { endHour: parseInt(e.target.value, 10) || 0 })}
                        disabled={disabled}
                        className="w-20"
                        aria-label={t('panel.settings.whitelist.schedule_end_hour')}
                    />

                    <span className="text-muted-foreground text-xs">
                        {t('panel.settings.whitelist.schedule_exclusive_end')}
                    </span>

                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={disabled}
                        onClick={() => handleRemoveWindow(index)}
                    >
                        <Trash2Icon className="size-4" />
                    </Button>
                </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={handleAddWindow} disabled={disabled}>
                <PlusIcon className="mr-1 size-4" />

                {t('panel.settings.whitelist.schedule_add_window')}
            </Button>
        </div>
    );
}
