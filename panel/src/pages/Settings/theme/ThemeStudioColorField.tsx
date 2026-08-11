import { Input } from '@/components/ui/input';
import { hexToHslTriple, hslTripleToHex, isValidHslTriple } from '@/lib/colorConversion';

type ThemeStudioColorFieldProps = {
    label: string;
    value: string;
    onChange: (hslTriple: string) => void;
};

export default function ThemeStudioColorField({ label, value, onChange }: ThemeStudioColorFieldProps) {
    const isValid = isValidHslTriple(value);

    return (
        <div className="flex items-center gap-2">
            <input
                type="color"
                className="border-input h-8 w-8 shrink-0 cursor-pointer rounded-md border p-0.5"
                value={isValid ? hslTripleToHex(value) : '#000000'}
                onChange={(e) => onChange(hexToHslTriple(e.target.value))}
                aria-label={label}
            />
            <div className="min-w-0 flex-1">
                <p className="text-foreground truncate text-xs font-medium">{label}</p>
                <Input
                    className="h-7 font-mono text-[11px]"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    aria-invalid={!isValid}
                />
            </div>
        </div>
    );
}
