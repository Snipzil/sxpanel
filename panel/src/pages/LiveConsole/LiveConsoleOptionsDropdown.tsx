import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingsIcon } from 'lucide-react';
import type { LiveConsoleOptions } from '@/pages/LiveConsole/LiveConsolePage';

type LiveConsoleOptionsDropdownProps = {
    options: LiveConsoleOptions;
    onOptionsChange: (options: LiveConsoleOptions) => void;
};

export default function LiveConsoleOptionsDropdown({ options, onOptionsChange }: LiveConsoleOptionsDropdownProps) {
    const tsValue = options.timestampDisabled
        ? 'off'
        : options.timestampForceHour12 === true
          ? '12h'
          : options.timestampForceHour12 === false
            ? '24h'
            : 'auto';

    const handleTimestampChange = (value: string) => {
        const newOpts = { ...options };
        if (value === 'off') {
            newOpts.timestampDisabled = true;
            newOpts.timestampForceHour12 = undefined;
        } else if (value === '12h') {
            newOpts.timestampDisabled = false;
            newOpts.timestampForceHour12 = true;
        } else if (value === '24h') {
            newOpts.timestampDisabled = false;
            newOpts.timestampForceHour12 = false;
        } else {
            newOpts.timestampDisabled = false;
            newOpts.timestampForceHour12 = undefined;
        }
        saveAndUpdate(newOpts);
    };

    const saveAndUpdate = (newOpts: LiveConsoleOptions) => {
        onOptionsChange(newOpts);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <div
                    tabIndex={0}
                    className="group bg-secondary xs:bg-transparent 2xl:hover:bg-secondary ring-offset-background focus-visible:ring-ring flex w-full cursor-pointer items-center justify-center rounded-lg px-1.5 py-2 transition-all focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden"
                >
                    <SettingsIcon className="text-muted-foreground group-hover:text-secondary-foreground inline h-6 w-6 group-hover:scale-110 2xl:h-5 2xl:w-5" />
                    <span className="ml-1 hidden align-middle 2xl:inline">Options</span>
                </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Timestamp</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={tsValue} onValueChange={handleTimestampChange}>
                    <DropdownMenuRadioItem value="auto">Auto</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="24h">24-hour</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="12h">12-hour</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="off">Hidden</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Copy Options</DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                    checked={options.copyTimestamp}
                    onCheckedChange={(checked) => saveAndUpdate({ ...options, copyTimestamp: !!checked })}
                >
                    Include timestamp
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                    checked={options.copyTag}
                    onCheckedChange={(checked) => saveAndUpdate({ ...options, copyTag: !!checked })}
                >
                    Include tag
                </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
