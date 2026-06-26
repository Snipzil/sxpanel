/** URL hash fragments appended to /login after logout or session expiry. */
export enum LogoutReasonHash {
    NONE = '',
    LOGOUT = '#logout',
    EXPIRED = '#expired',
    UPDATED = '#updated',
    MASTER_ALREADY_SET = '#master_already_set',
    SHUTDOWN = '#shutdown',
}
