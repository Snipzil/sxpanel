/**
 * Pure utility functions for addon management.
 * Extracted for testability.
 */
import path from 'node:path';
import fs from 'node:fs';

function normalizeForCompare(p: string): string {
    const normalized = path.normalize(p);
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Resolves `p` to its canonical (symlink-resolved) absolute path when it
 * exists on disk, falling back to `path.resolve(p)` if `realpath` throws.
 */
function resolveReal(p: string): string {
    try {
        return fs.realpathSync.native(p);
    } catch {
        return path.resolve(p);
    }
}

/**
 * Returns true iff `target` resolves to a path strictly inside `base`.
 * Uses canonical (symlink-resolved) paths when both exist, so sibling-prefix
 * tricks like base=/foo, target=/foo2/x and symlink escapes are rejected.
 * Equal paths (target === base) are NOT considered "inside".
 */
export function isPathInside(base: string, target: string): boolean {
    const absBase = normalizeForCompare(resolveReal(base));
    const absTarget = normalizeForCompare(resolveReal(target));
    const rel = normalizeForCompare(path.relative(absBase, absTarget));
    if (rel === '' || rel === '.') return false;
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    // Extra belt-and-braces: also verify with trailing separator prefix
    const baseWithSep = absBase.endsWith(path.sep) ? absBase : absBase + path.sep;
    return absTarget.startsWith(baseWithSep);
}

/**
 * Returns true iff `target` equals `base` or is strictly inside `base`,
 * using canonical paths. Useful when the entry itself may be `base` (rare)
 * or for directory containment checks.
 */
export function isPathInsideOrEqual(base: string, target: string): boolean {
    const absBase = normalizeForCompare(resolveReal(base));
    const absTarget = normalizeForCompare(resolveReal(target));
    if (absBase === absTarget) return true;
    const rel = normalizeForCompare(path.relative(absBase, absTarget));
    if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const baseWithSep = absBase.endsWith(path.sep) ? absBase : absBase + path.sep;
    return absTarget.startsWith(baseWithSep);
}

export interface DependencyNode {
    id: string;
    dependencies: string[];
}

/**
 * Topological sort of nodes by dependencies (dependencies come first).
 * Nodes with circular or unresolvable dependencies are placed at the end.
 */
export function topologicalSort<T extends DependencyNode>(nodes: T[]): T[] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const sorted: T[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (node: T) => {
        const id = node.id;
        if (visited.has(id)) return;
        if (visiting.has(id)) return; // circular — skip, will be appended at end
        visiting.add(id);
        for (const depId of node.dependencies) {
            const dep = nodeMap.get(depId);
            if (dep) visit(dep);
        }
        visiting.delete(id);
        visited.add(id);
        sorted.push(node);
    };

    for (const node of nodes) visit(node);

    // Append any unvisited (circular deps) at the end
    for (const node of nodes) {
        if (!visited.has(node.id)) sorted.push(node);
    }

    return sorted;
}

/**
 * Returns dependency IDs that are not in the running set.
 */
export function getMissingDependencies(dependencies: string[], runningIds: Set<string>): string[] {
    return dependencies.filter((depId) => !runningIds.has(depId));
}
