import { useEffect, useState } from 'react';
import { PlayersStatsResp } from '@shared/playerApiTypes';
import { useBackendApi } from '@/hooks/fetch';
import { isDevMockStatusOptInEnabled } from '@/lib/devFlags';

type PlayersStatsSuccess = Exclude<PlayersStatsResp, { error: string }>;

export function usePlayersStats() {
    const [stats, setStats] = useState<PlayersStatsSuccess | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);
    const statsApi = useBackendApi<PlayersStatsResp>({
        method: 'GET',
        path: '/player/stats',
        abortOnUnmount: true,
    });

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(null);
        const isDevMockMode = import.meta.env.DEV && isDevMockStatusOptInEnabled();
        if (isDevMockMode) {
            import('./devMockPlayers')
                .then(({ getMockPlayersStats }) => {
                    if (!isMounted) return;
                    const data = getMockPlayersStats();
                    if (data && 'error' in data) {
                        setStats(undefined);
                        setError(new Error(data.error));
                    } else {
                        setStats(data);
                    }
                    setIsLoading(false);
                })
                .catch((err) => {
                    if (!isMounted) return;
                    setError(err instanceof Error ? err : new Error(String(err)));
                    setIsLoading(false);
                });
            return () => {
                isMounted = false;
            };
        }
        statsApi({
            success(data) {
                if (data && 'error' in data) {
                    setStats(undefined);
                    setError(new Error(data.error));
                } else {
                    setStats(data);
                }
                setIsLoading(false);
            },
            error(message) {
                setError(new Error(message));
                setIsLoading(false);
            },
        });
    }, []);

    return { stats, isLoading, error };
}
