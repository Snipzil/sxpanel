import { atom } from 'jotai';
import { globalStatusAtom } from '@/hooks/status';

/** Server language from Settings → Language; falls back via useLocale when null. */
export const panelLanguageAtom = atom((get) => get(globalStatusAtom)?.language ?? null);
