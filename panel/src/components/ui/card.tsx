import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = ({ className, ref, ...props }: React.ComponentPropsWithRef<'div'>) => (
    <div
        ref={ref}
        className={cn('bg-card text-card-foreground border-border/60 rounded-xl border shadow-sm', className)}
        {...props}
    />
);
Card.displayName = 'Card';

const CardHeader = ({ className, ref, ...props }: React.ComponentPropsWithRef<'div'>) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
);
CardHeader.displayName = 'CardHeader';

const CardTitle = ({ className, children, ref, ...props }: React.ComponentPropsWithRef<'h3'>) => (
    <h3 ref={ref} className={cn('text-2xl leading-none font-semibold tracking-tight', className)} {...props}>
        {children ?? <span className="sr-only">Card title</span>}
    </h3>
);
CardTitle.displayName = 'CardTitle';

const CardDescription = ({ className, ref, ...props }: React.ComponentPropsWithRef<'p'>) => (
    <p ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />
);
CardDescription.displayName = 'CardDescription';

const CardContent = ({ className, ref, ...props }: React.ComponentPropsWithRef<'div'>) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
);
CardContent.displayName = 'CardContent';

const CardFooter = ({ className, ref, ...props }: React.ComponentPropsWithRef<'div'>) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
