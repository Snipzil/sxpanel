export enum ApiTimeout {
    DEFAULT = 7_500,
    LONG = 15_000,
    REALLY_LONG = 30_000,
    REALLY_REALLY_LONG = 45_000,
}

const defaultHeaders = {
    'Content-Type': 'application/json; charset=UTF-8',
    Accept: 'application/json',
};

type SimpleFetchOpts<Req = unknown> = {
    method?: 'GET' | 'POST' | 'DELETE';
    headers?: HeadersInit;
    body?: Req;
    timeout?: number;
};

/**
 * Simple unauthed fetch with timeout
 */
export const fetchWithTimeout = async <Resp = unknown, Req = unknown>(
    url: string,
    fetchOpts: SimpleFetchOpts<Req> = {},
) => {
    const method = fetchOpts.method ?? 'GET';
    const body = method === 'POST' && fetchOpts.body ? JSON.stringify(fetchOpts.body) : undefined;
    const response = await fetch(url, {
        headers: defaultHeaders,
        credentials: 'include',
        signal: AbortSignal.timeout(fetchOpts.timeout ?? ApiTimeout.DEFAULT),
        ...fetchOpts,
        method,
        body,
    });
    return (await response.json()) as Resp;
};
