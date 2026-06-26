import { useId } from 'react';
import { Label } from './ui/label';
import { RadioGroupItem } from './ui/radio-group';

type BigRadioItemProps = {
    value: string;
    title: string;
    desc: React.ReactNode;
    groupValue: string | undefined;
};

export default function BigRadioItem(props: BigRadioItemProps) {
    const radioId = 'radio' + useId();
    return (
        <div className="group">
            <Label
                htmlFor={radioId}
                className="hover:bg-card data-[state=checked]:border-primary/50 data-[state=checked]:bg-muted flex cursor-pointer items-center gap-3 rounded-lg border p-3 select-none"
                data-state={props.groupValue === props.value ? 'checked' : 'unchecked'}
            >
                <RadioGroupItem value={props.value} id={radioId} />
                <div className="space-y-1">
                    <span className="font-bold">{props.title}</span>
                    <p className="text-muted-foreground text-sm">{props.desc}</p>
                </div>
            </Label>
        </div>
    );
}
