/** Popular recipes index — https://github.com/citizenfx/txAdmin-recipes */
export const TXADMIN_RECIPES_INDEX_URL =
    'https://raw.githubusercontent.com/citizenfx/txAdmin-recipes/main/indexv4.json';

export type TxAdminRecipeEntry = {
    engine: string;
    name: string;
    author: string;
    version: string;
    description: string;
    url: string;
    tags: string[];
};

type RawTxAdminRecipeEntry = Omit<TxAdminRecipeEntry, 'engine' | 'author' | 'version'> & {
    engine: string | number;
    author?: string;
    version?: string;
};

/** Known GitHub org → display name (indexv4 no longer ships author). */
const KNOWN_RECIPE_AUTHORS: Record<string, string> = {
    citizenfx: 'CitizenFX',
    'esx-framework': 'ESX Framework',
    'Qbox-project': 'Qbox',
    'qbcore-framework': 'QBCore',
    VORPCORE: 'VORP Core',
};

/**
 * Derives maintainer label from raw.githubusercontent.com recipe URLs.
 */
export function deriveAuthorFromRecipeUrl(url: string): string {
    try {
        const parsed = new URL(url);
        if (parsed.hostname !== 'raw.githubusercontent.com') return '';
        const owner = parsed.pathname.split('/').filter(Boolean)[0];
        if (!owner) return '';
        if (KNOWN_RECIPE_AUTHORS[owner]) return KNOWN_RECIPE_AUTHORS[owner];
        return owner
            .split(/[-_]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    } catch {
        return '';
    }
}

function normalizeRecipeEntry(raw: RawTxAdminRecipeEntry): TxAdminRecipeEntry {
    const author = raw.author?.trim() || deriveAuthorFromRecipeUrl(raw.url);
    return {
        engine: String(raw.engine),
        name: raw.name,
        author,
        version: raw.version?.trim() ?? '',
        description: raw.description,
        url: raw.url,
        tags: raw.tags,
    };
}

/** One-line attribution for recipe cards; omits empty segments. */
export function recipeAttributionLine(recipe: TxAdminRecipeEntry): string | null {
    const author = recipe.author.trim();
    const version = recipe.version.trim();
    if (author && version) return `by ${author} · v${version}`;
    if (author) return `by ${author}`;
    if (version) return `v${version}`;
    return null;
}

export function recipeTagColor(tag: string) {
    if (tag === 'fivem') return 'bg-orange-500 text-white';
    if (tag === 'redm') return 'bg-red-600 text-white';
    return 'bg-muted text-muted-foreground';
}

export async function fetchTxAdminRecipeIndex(forceGameName?: string): Promise<TxAdminRecipeEntry[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
        const response = await fetch(TXADMIN_RECIPES_INDEX_URL, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const data = ((await response.json()) as RawTxAdminRecipeEntry[]).map(normalizeRecipeEntry);
        if (!forceGameName) return data;
        return data.filter((recipe) => recipe.tags.includes(forceGameName));
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            throw new Error('Request timed out while loading recipes.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function fetchRecipeYaml(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    } finally {
        clearTimeout(timeout);
    }
}
