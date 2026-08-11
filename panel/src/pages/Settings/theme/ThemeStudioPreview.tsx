import type { CSSProperties } from 'react';
import type { ThemeColorTokenStyle } from '@shared/themeTokens';

type ThemeStudioPreviewProps = {
    style: ThemeColorTokenStyle;
};

/**
 * Scoped live preview - the token values are applied as inline CSS custom
 * properties on the wrapper, so the Tailwind utilities below (which all
 * resolve to hsl(var(--x))) pick them up without touching the real page theme.
 */
export default function ThemeStudioPreview({ style }: ThemeStudioPreviewProps) {
    const cssVars = Object.fromEntries(
        Object.entries(style).map(([key, value]) => [`--${key}`, value]),
    ) as CSSProperties;

    return (
        <div
            style={cssVars}
            className="bg-background text-foreground border-border space-y-3 rounded-xl border p-4 text-sm"
        >
            <div className="bg-card border-border flex items-center justify-between rounded-lg border p-3">
                <div>
                    <p className="text-card-foreground font-semibold">Card title</p>
                    <p className="text-muted-foreground text-xs">Muted supporting text</p>
                </div>
                <div className="bg-accent text-accent-foreground rounded-md px-2 py-1 text-xs font-semibold">
                    Accent
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-semibold"
                >
                    Primary
                </button>
                <button
                    type="button"
                    className="bg-secondary text-secondary-foreground rounded-md px-3 py-1.5 text-xs font-semibold"
                >
                    Secondary
                </button>
                <button
                    type="button"
                    className="border-input bg-background text-foreground rounded-md border px-3 py-1.5 text-xs font-semibold"
                >
                    Input border
                </button>
            </div>

            <div className="flex flex-wrap gap-2">
                <span className="bg-destructive-hint text-destructive-inline rounded-md px-2 py-1 text-xs font-medium">
                    Destructive
                </span>
                <span className="bg-warning-hint text-warning-inline rounded-md px-2 py-1 text-xs font-medium">
                    Warning
                </span>
                <span className="bg-success-hint text-success-inline rounded-md px-2 py-1 text-xs font-medium">
                    Success
                </span>
                <span className="bg-info-hint text-info-inline rounded-md px-2 py-1 text-xs font-medium">Info</span>
            </div>

            <div className="bg-popover border-border text-popover-foreground rounded-lg border p-3 text-xs">
                Popover surface
            </div>
        </div>
    );
}
