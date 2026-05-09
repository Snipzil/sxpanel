// FiveM's NUI CEF document can block the Clipboard API via permissions policy,
// so use the legacy selection-based copy path here instead.

export const copyToClipboard = (value: string, isPlayerModal?: boolean): boolean => {
    const targetElement = isPlayerModal ? document.getElementById('player-modal-container') : document.body;
    if (!targetElement) return false;

    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const clipElem = document.createElement('textarea');
    clipElem.value = value;
    clipElem.setAttribute('readonly', 'true');
    clipElem.style.position = 'fixed';
    clipElem.style.opacity = '0';
    clipElem.style.pointerEvents = 'none';
    clipElem.style.top = '0';
    clipElem.style.left = '0';
    targetElement.appendChild(clipElem);

    try {
        clipElem.focus();
        clipElem.select();
        clipElem.setSelectionRange(0, value.length);
        return document.execCommand('copy');
    } finally {
        targetElement.removeChild(clipElem);
        activeElement?.focus();
    }
};
