import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GameId } from './deployerFlowTypes';
import { deployerStepActionsClass } from './deployerLayout';

const GAMES: { id: GameId; title: string; desc: string; accent: string }[] = [
    {
        id: 'fivem',
        title: 'FiveM',
        desc: 'GTA V multiplayer — ESX, QBCore, Qbox, and more.',
        accent: 'from-orange-500/20 to-orange-600/5 border-orange-500/40',
    },
    {
        id: 'redm',
        title: 'RedM',
        desc: 'Red Dead Redemption multiplayer — VORP and other frameworks.',
        accent: 'from-red-600/20 to-red-700/5 border-red-600/40',
    },
];

export function DeployerGameStep({
    selected,
    onSelect,
    onContinue,
}: {
    selected: GameId | null;
    onSelect: (game: GameId) => void;
    onContinue: () => void;
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex flex-col gap-3">
                    <div>
                        <h2 className="text-foreground text-sm font-semibold">Choose your game</h2>
                        <p className="text-muted-foreground text-xs">
                            This filters popular recipes from the txAdmin index to templates for that platform.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
                        {GAMES.map((g) => {
                            const isActive = selected === g.id;
                            return (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => onSelect(g.id)}
                                    className={cn(
                                        'border-border hover:border-primary/60 flex h-auto w-full flex-col gap-1.5 rounded-xl border bg-gradient-to-br p-4 text-left transition-colors',
                                        g.accent,
                                        isActive && 'ring-primary border-primary ring-2',
                                    )}
                                >
                                    <span className="text-foreground text-base font-semibold">{g.title}</span>
                                    <span className="text-muted-foreground text-xs leading-snug">{g.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                    {!selected && (
                        <p className="text-muted-foreground text-center text-[11px]">
                            Select FiveM or RedM to continue
                        </p>
                    )}
                </div>
            </div>
            <div className={deployerStepActionsClass}>
                <span className="text-muted-foreground text-xs" />
                <Button type="button" size="sm" disabled={!selected} onClick={onContinue}>
                    Continue
                </Button>
            </div>
        </div>
    );
}
