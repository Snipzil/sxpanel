export const validToastTypes = ['default', 'loading', 'info', 'success', 'warning', 'error'] as const;

export type TxToastType = (typeof validToastTypes)[number];
