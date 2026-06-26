import { useState } from 'react';

import { Button } from '@/components/ui/button';

import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    Code2Icon,
    ShieldCheckIcon,
    ShieldOffIcon,
    XIcon,
} from 'lucide-react';

import { LazyMonacoEditor } from '@/components/LazyMonacoEditor';

import MarkdownProse from '@/components/MarkdownProse';

import { cn } from '@/lib/utils';

import type { RecipeInfo } from './deployerTypes';

import { deployerStepActionsClass, deployerStepBodyClass } from './deployerLayout';

export function DeployerReviewStep({
    recipe,

    deployPath,

    onConfirm,

    onBack,

    onCancel,
}: {
    recipe: RecipeInfo;

    deployPath?: string;

    onConfirm: (editedRecipe: string) => void;

    onBack?: () => void;

    onCancel: () => void;
}) {
    const [recipeText, setRecipeText] = useState(recipe.raw);

    const [showEditor, setShowEditor] = useState(false);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className={deployerStepBodyClass}>
                <div className="flex h-full min-h-0 flex-col gap-2">
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <h2 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">{recipe.name}</h2>

                        <span
                            className={cn(
                                'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',

                                recipe.isTrustedSource
                                    ? 'border-success/30 bg-success/10 text-success-inline'
                                    : 'border-warning/30 bg-warning/10 text-warning-inline',
                            )}
                        >
                            {recipe.isTrustedSource ? (
                                <ShieldCheckIcon className="size-3" />
                            ) : (
                                <ShieldOffIcon className="size-3" />
                            )}

                            {recipe.isTrustedSource ? 'Trusted' : 'Untrusted'}
                        </span>

                        <span className="text-muted-foreground shrink-0 text-xs">by {recipe.author}</span>
                    </div>

                    {deployPath && (
                        <p className="text-muted-foreground shrink-0 font-mono text-[10px] break-all">
                            Deploy path: {deployPath}
                        </p>
                    )}

                    {!recipe.isTrustedSource && (
                        <p className="text-warning-inline shrink-0 text-xs">
                            Untrusted source — inspect the raw recipe before continuing.
                        </p>
                    )}

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <button
                            type="button"
                            aria-expanded={showEditor}
                            onClick={() => setShowEditor((open) => !open)}
                            className={cn(
                                'border-border/60 bg-muted/40 hover:bg-muted/60 flex w-full shrink-0 items-center justify-between gap-2 border px-3 py-2 text-left text-xs font-medium transition-colors',

                                showEditor ? 'rounded-t-md' : 'rounded-md',
                            )}
                        >
                            <span className="text-foreground flex items-center gap-1.5">
                                <Code2Icon className="size-3.5 shrink-0" />

                                {showEditor ? 'Hide raw recipe' : 'Show raw recipe'}
                            </span>

                            <ChevronDownIcon
                                className={cn(
                                    'text-muted-foreground size-4 shrink-0 transition-transform duration-200',

                                    showEditor && 'rotate-180',
                                )}
                            />
                        </button>

                        {showEditor ? (
                            <div className="border-border/60 relative min-h-0 flex-1 overflow-hidden rounded-b-md border border-t-0">
                                <div className="absolute inset-0">
                                    <LazyMonacoEditor
                                        height="100%"
                                        language="yaml"
                                        value={recipeText}
                                        onChange={(v) => setRecipeText(v ?? '')}
                                        options={{
                                            minimap: { enabled: false },

                                            wordWrap: 'on',

                                            lineNumbers: 'on',

                                            scrollBeyondLastLine: false,
                                        }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="text-muted-foreground min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2 text-xs [&_.prose]:text-xs">
                                <MarkdownProse md={recipe.description} isSmall />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className={deployerStepActionsClass}>
                <div className="flex gap-2">
                    {onBack && (
                        <Button type="button" variant="outline" size="sm" onClick={onBack}>
                            <ChevronLeftIcon className="mr-1 size-3.5" /> Back
                        </Button>
                    )}

                    <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                        <XIcon className="mr-1 size-3.5" /> Cancel
                    </Button>
                </div>

                <Button type="button" size="sm" onClick={() => onConfirm(recipeText)}>
                    Continue <ChevronRightIcon className="ml-1 size-3.5" />
                </Button>
            </div>
        </div>
    );
}
