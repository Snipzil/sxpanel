export const DEV_MOCK_STATUS_STORAGE_KEY = 'fxpanel.devMockStatus';
export const DEV_MOCK_STATUS_QUERY_KEY = 'devMockStatus';

export const isDevMockStatusOptInEnabled = () => {
    if (typeof window === 'undefined') return false;

    const queryValue = new URLSearchParams(window.location.search).get(DEV_MOCK_STATUS_QUERY_KEY);
    if (queryValue === '1') return true;
    if (queryValue === '0') return false;

    const storageEnabled = window.localStorage.getItem(DEV_MOCK_STATUS_STORAGE_KEY) === '1';

    return storageEnabled;
};

export const setDevMockStatusOptInEnabled = (enabled: boolean) => {
    if (typeof window === 'undefined') return;

    if (enabled) {
        window.localStorage.setItem(DEV_MOCK_STATUS_STORAGE_KEY, '1');
    } else {
        window.localStorage.removeItem(DEV_MOCK_STATUS_STORAGE_KEY);
    }

    const pageUrl = new URL(window.location.href);
    if (enabled) {
        pageUrl.searchParams.set(DEV_MOCK_STATUS_QUERY_KEY, '1');
    } else {
        pageUrl.searchParams.delete(DEV_MOCK_STATUS_QUERY_KEY);
    }
    window.history.replaceState({}, '', pageUrl);
};
