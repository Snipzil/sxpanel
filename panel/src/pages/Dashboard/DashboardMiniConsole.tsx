import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { TerminalIcon } from 'lucide-react';
import { cn, getSocket, joinSocketRoom, leaveSocketRoom } from '@/lib/utils';
import { useAdminPerms } from '@/hooks/auth';
import { sanitizeTermLine, extractTermLineTimestamp } from '@/pages/LiveConsole/liveConsoleUtils';
import type { LiveConsoleInitialData } from '@shared/consoleBlock';
import { dashboardCardClass, DashboardCardHeader } from './DashboardCard';

const MAX_LINES = 60;

/** Splits a raw stdout/stderr chunk into sanitized, timestamp-stripped display lines. */
function chunkToLines(raw: string): string[] {
    return raw
        .split(/\r?\n/)
        .filter((line) => line.length > 0)
        .map((line) => extractTermLineTimestamp(sanitizeTermLine(line)).content);
}

/** Lightweight read-only tail of the live console, just for the dashboard widget (no xterm/input). */
function useMiniConsole(enabled: boolean) {
    const [lines, setLines] = useState<string[]>([]);

    useEffect(() => {
        if (!enabled) return;
        const socket = getSocket();
        const handler = (data: string | LiveConsoleInitialData) => {
            let newLines: string[] = [];
            if (typeof data === 'string') {
                newLines = chunkToLines(data);
            } else if (data && Array.isArray(data.blocks)) {
                newLines = data.blocks.flatMap((block) => chunkToLines(block.data));
            }
            if (!newLines.length) return;
            setLines((prev) => [...prev, ...newLines].slice(-MAX_LINES));
        };
        (socket as any).on('consoleData', handler);
        joinSocketRoom('liveconsole');

        return () => {
            (socket as any).off('consoleData', handler);
            leaveSocketRoom('liveconsole');
        };
    }, [enabled]);

    return lines;
}

export default function DashboardMiniConsole() {
    const { hasPerm } = useAdminPerms();
    const canViewConsole = hasPerm('console.view');
    const lines = useMiniConsole(canViewConsole);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [, navigate] = useLocation();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lines]);

    if (!canViewConsole) return null;

    return (
        <div className={cn(dashboardCardClass, 'flex flex-col')}>
            <DashboardCardHeader icon={TerminalIcon} title="Live Console">
                <button
                    type="button"
                    onClick={() => navigate('/server/console')}
                    className="text-accent hover:text-accent/80 text-xs font-medium transition-colors"
                >
                    Open console →
                </button>
            </DashboardCardHeader>
            <div
                ref={scrollRef}
                className="mx-5 mb-4 h-36 overflow-y-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-white/80 [scrollbar-width:thin]"
            >
                {lines.length === 0 ? (
                    <p className="text-muted-foreground/50 italic">Waiting for console output…</p>
                ) : (
                    lines.map((line, idx) => (
                        <p key={idx} className="truncate whitespace-pre">
                            {line}
                        </p>
                    ))
                )}
            </div>
        </div>
    );
}
