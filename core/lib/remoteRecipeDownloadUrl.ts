/**
 * Validates a user-supplied HTTP(S) URL before the headless deployer downloads a recipe.
 * Reduces SSRF risk to obvious private / metadata targets; hostname DNS is not pre-resolved.
 */
export function assertSafeRemoteRecipeUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('Invalid recipe URL');
    }

    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
        throw new Error('Recipe URL must use http: or https:');
    }

    if (url.username || url.password) {
        throw new Error('Recipe URL must not include embedded credentials');
    }

    const host = url.hostname.toLowerCase();
    const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';

    if (protocol === 'http:' && !isLoopback) {
        throw new Error('Recipe download over http:// is only allowed for localhost / 127.0.0.1 / ::1');
    }

    // Loopback is only reachable from the same machine running headless — allowed for local recipes.
    if (!isLoopback && isPrivateOrBlockedHost(host)) {
        throw new Error('Recipe URL host is blocked (private, link-local, or reserved)');
    }

    return url;
}

function isPrivateOrBlockedHost(host: string): boolean {
    const blockedNames = new Set(['metadata.google.internal', 'metadata.goog', '0.0.0.0']);
    if (blockedNames.has(host)) return true;

    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4) {
        const oct = [Number(ipv4[1]), Number(ipv4[2]), Number(ipv4[3]), Number(ipv4[4])];
        if (oct.some((n) => n > 255)) return true;
        const [a, b] = oct;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && oct[1] === 254) return true;
        if (a === 192 && oct[1] === 168) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;
    }

    return false;
}
