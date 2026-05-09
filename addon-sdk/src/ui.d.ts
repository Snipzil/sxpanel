/**
 * @fxpanel/addon-sdk/ui — TypeScript definitions
 *
 * Re-exports of fxPanel's shadcn/ui components for use in addon panel bundles.
 */

import type {
    ComponentType,
    ReactNode,
    ButtonHTMLAttributes,
    InputHTMLAttributes,
    TextareaHTMLAttributes,
} from 'react';

// Button
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'link';
    size?: 'default' | 'sm' | 'lg' | 'icon';
    children?: ReactNode;
}
export declare const Button: ComponentType<ButtonProps>;

// Card
export interface CardProps {
    className?: string;
    children?: ReactNode;
}
export declare const Card: ComponentType<CardProps>;
export declare const CardHeader: ComponentType<CardProps>;
export declare const CardContent: ComponentType<CardProps>;
export declare const CardFooter: ComponentType<CardProps>;

// Badge
export interface BadgeProps {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
    children?: ReactNode;
    className?: string;
}
export declare const Badge: ComponentType<BadgeProps>;

// Input
export interface InputComponentProps extends InputHTMLAttributes<HTMLInputElement> {
    className?: string;
}
export declare const Input: ComponentType<InputComponentProps>;

// Textarea
export interface TextareaComponentProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    className?: string;
}
export declare const Textarea: ComponentType<TextareaComponentProps>;

// Select
export interface SelectProps {
    onValueChange?: (value: string) => void;
    value?: string;
    children?: ReactNode;
}
export declare const Select: ComponentType<SelectProps>;
export interface SelectItemProps {
    value: string;
    children?: ReactNode;
}
export declare const SelectItem: ComponentType<SelectItemProps>;

// Dialog
export interface DialogProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: ReactNode;
}
export declare const Dialog: ComponentType<DialogProps>;
export declare const DialogHeader: ComponentType<CardProps>;
export declare const DialogContent: ComponentType<CardProps>;
export declare const DialogFooter: ComponentType<CardProps>;

// Table
export declare const Table: ComponentType<CardProps>;
export declare const TableHeader: ComponentType<CardProps>;
export declare const TableRow: ComponentType<CardProps>;
export declare const TableCell: ComponentType<CardProps>;

// Tabs
export interface TabsProps {
    defaultValue?: string;
    value?: string;
    onValueChange?: (value: string) => void;
    children?: ReactNode;
    className?: string;
}
export declare const Tabs: ComponentType<TabsProps>;
export declare const TabsList: ComponentType<CardProps>;
export interface TabsTriggerProps {
    value: string;
    children?: ReactNode;
    className?: string;
}
export declare const TabsTrigger: ComponentType<TabsTriggerProps>;
export interface TabsContentProps {
    value: string;
    children?: ReactNode;
    className?: string;
}
export declare const TabsContent: ComponentType<TabsContentProps>;

// Alert
export interface AlertProps {
    variant?: 'default' | 'destructive';
    children?: ReactNode;
    className?: string;
}
export declare const Alert: ComponentType<AlertProps>;
export declare const AlertTitle: ComponentType<CardProps>;
export declare const AlertDescription: ComponentType<CardProps>;

// Tooltip
export interface TooltipProps {
    content?: string;
    children?: ReactNode;
}
export declare const Tooltip: ComponentType<TooltipProps>;

// Skeleton
export interface SkeletonProps {
    className?: string;
}
export declare const Skeleton: ComponentType<SkeletonProps>;

// ScrollArea
export declare const ScrollArea: ComponentType<CardProps>;

// Separator
export interface SeparatorProps {
    orientation?: 'horizontal' | 'vertical';
    className?: string;
}
export declare const Separator: ComponentType<SeparatorProps>;
