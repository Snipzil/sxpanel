import type { ReactNode } from 'react';
import { SlimPercentBar } from './KeyValueRow';

function HeroTile({
    label,
    value,
    sub,
    barValue,
    barClassName,
}: {
    label: string;
    value: ReactNode;
    sub?: ReactNode;
    barValue?: number;
    barClassName?: string;
}) {
    return (
        <div className="bg-muted/25 border-border/50 flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-muted-foreground/60 text-[11px] font-semibold tracking-widest uppercase">{label}</p>
            <p className="text-foreground text-xl font-semibold tabular-nums">{value}</p>
            {sub && <p className="text-muted-foreground text-xs">{sub}</p>}
            {barValue !== undefined && <SlimPercentBar value={barValue} className={barClassName} />}
        </div>
    );
}

export function DiagnosticsHeroStats({
    cpuPct,
    memPct,
    heapPct,
    uptime,
    monitorRestarts,
    hbFailsTotal,
}: {
    cpuPct: number | null;
    memPct: number | null;
    heapPct: number | null;
    uptime: string;
    monitorRestarts: number;
    hbFailsTotal: number;
}) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <HeroTile
                label="CPU usage"
                value={cpuPct !== null ? `${cpuPct.toFixed(1)}%` : '—'}
                barValue={cpuPct ?? undefined}
            />
            <HeroTile
                label="Host memory"
                value={memPct !== null ? `${memPct.toFixed(1)}%` : '—'}
                barValue={memPct ?? undefined}
                barClassName={memPct !== null && memPct > 85 ? 'bg-warning' : undefined}
            />
            <HeroTile
                label="Heap"
                value={heapPct !== null ? `${heapPct.toFixed(1)}%` : '—'}
                barValue={heapPct ?? undefined}
                barClassName={heapPct !== null && heapPct > 85 ? 'bg-warning' : undefined}
            />
            <HeroTile label="Uptime" value={uptime} />
            <HeroTile label="Monitor restarts" value={monitorRestarts} sub={`HB fails (HTTP + FD3): ${hbFailsTotal}`} />
        </div>
    );
}
