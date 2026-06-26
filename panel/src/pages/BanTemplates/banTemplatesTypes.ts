import type { BanDurationType } from '@shared/otherTypes';

export type BanTemplatesInputData = {
    id: string | null;
    reason: string;
    duration: BanDurationType;
};
