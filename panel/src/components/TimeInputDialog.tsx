import { useId, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from './ui/label';
import { useLocale } from '@/hooks/locale';

type StyledHourOptionProps = {
    value: string;
    label24h: string;
    label12h: string;
};

function StyledHourOption({ value, label24h, label12h }: StyledHourOptionProps) {
    return (
        <SelectItem value={value} className="group/timeOption">
            <div className="flex items-center justify-around gap-2">
                <div className="min-w-[2ch] font-medium">{label24h}</div>
                <div className="text-muted-foreground group-focus/timeOption:text-primary min-w-[5ch] text-right text-sm">
                    {label12h}
                </div>
            </div>
        </SelectItem>
    );
}

type TimeInputDialogProps = {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (time: string) => void;
};

export function TimeInputDialog({ title, isOpen, onClose, onSubmit }: TimeInputDialogProps) {
    const { t } = useLocale();
    const [hour, setHour] = useState('00');
    const [minute, setMinute] = useState('00');
    const hourSelectId = `timeinput-${useId()}`;
    const minuteSelectId = `timeinput-${useId()}`;

    const handleSubmit = () => {
        onSubmit(`${hour}:${minute}`);
        setHour('00');
        setMinute('00');
        onClose();
    };

    const hoursArray = useMemo(
        () =>
            Array.from({ length: 24 }, (_, i) => {
                const h = i.toString().padStart(2, '0');
                const ampm = i < 12 ? 'AM' : 'PM';
                const h12 = i % 12 || 12;
                return {
                    value: h,
                    label24h: h,
                    label12h: `${h12} ${ampm}`,
                } satisfies StyledHourOptionProps;
            }),
        [],
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-y-1.5">
                            <Label htmlFor={hourSelectId} className="text-sm font-medium">
                                {t('panel.common.hour')}
                            </Label>
                            <Select onValueChange={setHour} value={hour}>
                                <SelectTrigger id={hourSelectId}>
                                    <SelectValue placeholder={t('panel.common.select_hour')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {hoursArray.map((h) => (
                                        <StyledHourOption key={h.value} {...h} />
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-y-1.5">
                            <Label htmlFor={minuteSelectId} className="text-sm font-medium">
                                {t('panel.common.minute')}
                            </Label>
                            <Select onValueChange={setMinute} value={minute}>
                                <SelectTrigger id={minuteSelectId}>
                                    <SelectValue placeholder={t('panel.common.select_minute')} />
                                </SelectTrigger>
                                <SelectContent onBlur={(e) => e.preventDefault()}>
                                    <SelectItem value={'00'}>00</SelectItem>
                                    <SelectItem value={'05'}>05</SelectItem>
                                    <SelectItem value={'10'}>10</SelectItem>
                                    <SelectItem value={'15'}>15</SelectItem>
                                    <SelectItem value={'20'}>20</SelectItem>
                                    <SelectItem value={'25'}>25</SelectItem>
                                    <SelectItem value={'30'}>30</SelectItem>
                                    <SelectItem value={'35'}>35</SelectItem>
                                    <SelectItem value={'40'}>40</SelectItem>
                                    <SelectItem value={'45'}>45</SelectItem>
                                    <SelectItem value={'50'}>50</SelectItem>
                                    <SelectItem value={'55'}>55</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSubmit}>{t('panel.common.add_time')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
