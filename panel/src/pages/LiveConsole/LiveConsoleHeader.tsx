import { RocketIcon, SkipBackIcon } from 'lucide-react';

type LiveConsoleHeaderProps = {
    isConnected: boolean;
    hasSpawnLines: boolean;
    onJumpToLastStart: () => void;
    onJumpToPrevStart: () => void;
};

export default function LiveConsoleHeader({
    isConnected,
    hasSpawnLines,
    onJumpToLastStart,
    onJumpToPrevStart,
}: LiveConsoleHeaderProps) {
    return (
        <div className="border-border/40 flex shrink flex-col border-b px-1 py-2.5 sm:px-4">
            <div className="flex items-center space-x-2">
                <svg
                    aria-hidden="true"
                    className="text-success h-3.5 w-3.5"
                    fill="none"
                    height="24"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="24"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" x2="20" y1="19" y2="19" />
                </svg>
                <p className="text-foreground font-mono text-sm font-medium">Live Console</p>
                <span
                    className={`ml-1 h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-success' : 'bg-muted-foreground/40'}`}
                >
                    <span className="sr-only">{isConnected ? 'Connected' : 'Disconnected'}</span>
                </span>

                {isConnected && hasSpawnLines && (
                    <div className="flex items-center gap-1 pl-2">
                        <button
                            className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
                            onClick={onJumpToLastStart}
                            title="Jump to last server start"
                        >
                            <RocketIcon className="h-3 w-3" />
                            <span className="hidden sm:inline">Last Start</span>
                        </button>
                        <button
                            className="text-muted-foreground hover:text-foreground hover:bg-secondary/40 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
                            onClick={onJumpToPrevStart}
                            title="Jump to previous server start"
                        >
                            <SkipBackIcon className="h-3 w-3" />
                            <span className="hidden sm:inline">Prev Start</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
