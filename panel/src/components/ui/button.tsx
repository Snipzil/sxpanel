import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/75',
                destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/75',
                warning: 'bg-warning text-warning-foreground hover:bg-warning/75',
                success: 'bg-success text-success-foreground hover:bg-success/75',
                info: 'bg-info text-info-foreground hover:bg-info/75',
                'outline-solid': 'border border-primary bg-primary text-primary-foreground hover:bg-primary/80',
                outline: 'border border-foreground hover:bg-primary hover:text-primary-foreground',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/75',
                ghost: 'hover:bg-primary hover:text-primary-foreground',
                muted: 'bg-muted text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
                'outline-secondary':
                    'border border-secondary bg-transparent text-secondary-foreground hover:bg-secondary/20',
                'ghost-secondary': 'text-secondary-foreground hover:bg-secondary/20',
                'outline-destructive':
                    'border border-destructive bg-transparent text-destructive hover:bg-destructive/10',
                'ghost-destructive': 'text-destructive hover:bg-destructive/10',
                'outline-warning': 'border border-warning bg-transparent text-warning-foreground hover:bg-warning/15',
                'ghost-warning': 'text-warning-foreground hover:bg-warning/15',
                'outline-success': 'border border-success bg-transparent text-success-foreground hover:bg-success/15',
                'ghost-success': 'text-success-foreground hover:bg-success/15',
                'outline-info': 'border border-info bg-transparent text-info-foreground hover:bg-info/15',
                'ghost-info': 'text-info-foreground hover:bg-info/15',
                'outline-muted':
                    'border border-muted-foreground/40 bg-transparent text-muted-foreground hover:bg-muted',
                'ghost-muted': 'text-muted-foreground hover:bg-muted',
                link: 'text-accent underline-offset-4 hover:underline',
            },
            size: {
                default: 'h-10 px-4 py-2',
                inline: 'h-5 px-1.5 rounded-sm text-xs tracking-wider',
                xs: 'h-7 rounded-sm px-2 text-sm',
                sm: 'h-9 rounded-md px-3',
                lg: 'h-11 rounded-md px-8',
                icon: 'size-10',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

interface ButtonProps extends React.ComponentPropsWithRef<'button'>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
}
Button.displayName = 'Button';

export { Button, buttonVariants };
