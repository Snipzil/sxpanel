/** Stable id generator for deferral layout/canvas blocks (no layout/canvas imports). */
export function createDeferralBlockId(): string {
    return `blk_${Math.random().toString(36).slice(2, 10)}`;
}
