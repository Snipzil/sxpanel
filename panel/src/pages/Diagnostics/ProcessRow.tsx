import { SlimPercentBar } from './KeyValueRow';

export function ProcessRow({
    name,
    pid,
    ppid,
    cpu,
    memoryMb,
    cpuMax,
    memMax,
}: {
    name: string;
    pid: number;
    ppid: number;
    cpu: number | null;
    memoryMb: number | null;
    cpuMax: number;
    memMax: number;
}) {
    const cpuVal = cpu ?? 0;
    const memVal = memoryMb ?? 0;
    const cpuBar = cpuMax > 0 ? Math.min(100, (cpuVal / cpuMax) * 100) : 0;
    const memBar = memMax > 0 ? Math.min(100, (memVal / memMax) * 100) : 0;

    return (
        <div className="bg-muted/20 border-border/50 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate font-medium">
                        <span className="text-muted-foreground font-mono text-xs">({pid})</span> {name}
                    </p>
                    <p className="text-muted-foreground font-mono text-xs">Parent PID {ppid}</p>
                </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                    <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">CPU</span>
                        <span className="font-mono tabular-nums">{cpu !== null ? `${cpu.toFixed(1)}%` : '—'}</span>
                    </div>
                    <SlimPercentBar value={cpuBar} className="bg-primary" />
                </div>
                <div>
                    <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">Memory</span>
                        <span className="font-mono tabular-nums">
                            {memoryMb !== null ? `${memoryMb.toFixed(1)} MB` : '—'}
                        </span>
                    </div>
                    <SlimPercentBar value={memBar} className="bg-secondary-foreground/40" />
                </div>
            </div>
        </div>
    );
}
