import { useEffect, useState } from 'react';
import { useAuthedFetcher } from '@/hooks/fetch';
import type { DeferralAddonMetaResponse } from '@shared/deferralAddonTypes';

const EMPTY: DeferralAddonMetaResponse = {
    scenarios: [],
    tokens: [],
    installedAddonIds: [],
};

export function useDeferralAddonMeta() {
    const authedFetcher = useAuthedFetcher();
    const [meta, setMeta] = useState<DeferralAddonMetaResponse>(EMPTY);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        authedFetcher<{ error?: string } & DeferralAddonMetaResponse>('/deferral/addon-meta')
            .then((data) => {
                if (cancelled) return;
                if (data && !('error' in data && data.error)) {
                    setMeta({
                        scenarios: data.scenarios ?? [],
                        tokens: data.tokens ?? [],
                        installedAddonIds: data.installedAddonIds ?? [],
                    });
                }
            })
            .catch(() => {
                if (!cancelled) setMeta(EMPTY);
            })
            .finally(() => {
                if (!cancelled) setLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, [authedFetcher]);

    return { meta, loaded };
}
