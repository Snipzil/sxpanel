export type MockPlayer = {
    netid: number;
    displayName: string;
    pureName: string;
    license: string;
    playTimeMinutes: number;
    sessionTimeSeconds: number;
    tags: string[];
};

export const MOCK_PREVIEW_PLAYERS: MockPlayer[] = Array.from({ length: 12 }, (_, index) => ({
    netid: index + 1,
    displayName: `Preview Player ${index + 1}`,
    pureName: `Preview Player ${index + 1}`,
    license: `license:preview${index + 1}`,
    playTimeMinutes: (index + 1) * 48,
    sessionTimeSeconds: (index + 1) * 120,
    tags: index % 3 === 0 ? ['vip'] : [],
}));

const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours} hr, ${remainder} mins` : `${hours} hr`;
};

const formatSeconds = (seconds: number) => {
    if (seconds < 60) return `${seconds} secs`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours} hr, ${remainder} mins` : `${hours} hr`;
};

export const formatPreviewPlayTime = (playTimeMinutes: number) => formatMinutes(Math.max(playTimeMinutes, 0));

export const formatPreviewSessionTime = (sessionTimeSeconds: number) => formatSeconds(Math.max(sessionTimeSeconds, 0));
