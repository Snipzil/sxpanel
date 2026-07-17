import { createContext, use } from 'react';

export const PlayerlistCollapsedCtx = createContext(false);
export const usePlayerlistCollapsed = () => use(PlayerlistCollapsedCtx);
