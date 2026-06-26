import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva(
    'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
    {
        variants: {
            variant: {
                default: 'bg-background text-foreground',
                warning: 'border-warning/50 bg-warning/10 text-warning-foreground [&>svg]:text-warning',
                info: 'border-info/50 bg-info/10 text-info-foreground [&>svg]:text-info',
                success: 'border-success/50 bg-success/10 text-success-foreground [&>svg]:text-success',
                destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

type AlertProps = React.ComponentPropsWithRef<'div'> & VariantProps<typeof alertVariants>;

const Alert = ({ className, variant, ref, ...props }: AlertProps) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
);
Alert.displayName = 'Alert';

const AlertTitle = ({ className, children, ref, ...props }: React.ComponentPropsWithRef<'h5'>) => (
    <h5 ref={ref} className={cn('mb-1 leading-none font-medium tracking-tight', className)} {...props}>
        {children ?? <span className="sr-only">Alert title</span>}
    </h5>
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = ({ className, ref, ...props }: React.ComponentPropsWithRef<'div'>) => (
    <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
