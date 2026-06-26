import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { cn } from '@/lib/utils';

const DropDownSelect = SelectPrimitive.Root;

const DropDownSelectValue = SelectPrimitive.Value;

const DropDownSelectTrigger = ({ children, ref }: React.ComponentPropsWithRef<typeof SelectPrimitive.Trigger>) => (
    <SelectPrimitive.Trigger ref={ref} asChild>
        {children}
    </SelectPrimitive.Trigger>
);
DropDownSelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const DropDownSelectScrollUpButton = ({
    className,
    ref,
    ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.ScrollUpButton>) => (
    <SelectPrimitive.ScrollUpButton
        ref={ref}
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...props}
    >
        <ChevronUp className="size-4" />
    </SelectPrimitive.ScrollUpButton>
);
DropDownSelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const DropDownSelectScrollDownButton = ({
    className,
    ref,
    ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.ScrollDownButton>) => (
    <SelectPrimitive.ScrollDownButton
        ref={ref}
        className={cn('flex cursor-default items-center justify-center py-1', className)}
        {...props}
    >
        <ChevronDown className="size-4" />
    </SelectPrimitive.ScrollDownButton>
);
DropDownSelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const DropDownSelectContent = ({
    className,
    children,
    position = 'popper',
    ref,
    ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Content>) => (
    <SelectPrimitive.Content
        ref={ref}
        className={cn(
            'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-96 min-w-32 overflow-hidden rounded-md border shadow-md',
            position === 'popper' &&
                'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
            className,
        )}
        position={position}
        {...props}
    >
        <DropDownSelectScrollUpButton />
        <SelectPrimitive.Viewport
            className={cn(
                'p-1',
                position === 'popper' &&
                    'h-(--radix-select-trigger-height) w-full min-w-(--radix-select-trigger-width)',
            )}
        >
            {children}
        </SelectPrimitive.Viewport>
        <DropDownSelectScrollDownButton />
    </SelectPrimitive.Content>
);
DropDownSelectContent.displayName = SelectPrimitive.Content.displayName;

const DropDownSelectItem = ({
    className,
    children,
    ref,
    ...props
}: React.ComponentPropsWithRef<typeof SelectPrimitive.Item>) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cn(
            'focus:bg-accent focus:text-accent-foreground relative flex w-full cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50',
            className,
        )}
        {...props}
    >
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
);
DropDownSelectItem.displayName = SelectPrimitive.Item.displayName;

export { DropDownSelect, DropDownSelectTrigger, DropDownSelectItem, DropDownSelectContent };
