import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function LabelRequired() {
    return (
        <span className="text-2xs text-destructive-inline tracking-widest opacity-65 group-hover/cfgCardItem:opacity-100">
            REQUIRED
        </span>
    );
}
function LabelOptional() {
    return (
        <span className="text-2xs text-info-inline tracking-widest opacity-0 group-hover/cfgCardItem:opacity-35">
            OPTIONAL
        </span>
    );
}

/**
 * A description for a setting item.
 */
export function SettingItemDesc({ children, className }: SettingItemDescProps) {
    return <div className={cn('text-muted-foreground text-sm', className)}>{children}</div>;
}

type SettingItemDescProps = {
    children: React.ReactNode;
    className?: string;
};

/**
 * A setting item.
 */
export function SettingItem({
    label,
    htmlFor,
    required: isRequired,
    showOptional,
    showIf,
    children,
}: SettingItemProps) {
    if (showIf !== undefined && !showIf) return null;
    return (
        <div className="group/cfgCardItem max-w-4xl space-y-2 sm:grid sm:grid-cols-8 sm:items-start sm:gap-4 sm:space-y-0">
            <div className="sm:col-span-2">
                <Label className="flex flex-col text-sm leading-6 font-medium" htmlFor={htmlFor}>
                    {label}
                    {isRequired && <LabelRequired />}
                    {showOptional && <LabelOptional />}
                </Label>
            </div>
            <div className="space-y-2 sm:col-span-6">{children}</div>
        </div>
    );
}

type SettingItemProps = {
    label: string;
    htmlFor?: string;
    required?: boolean;
    showOptional?: boolean;
    showIf?: boolean;
    children: React.ReactNode;
};

/**
 * A divider for advanced options.
 */
export function AdvancedDivider() {
    return (
        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <hr className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs tracking-wider">
                <span className="bg-background text-muted-foreground/75 px-2">Advanced Options</span>
            </div>
        </div>
    );
}
