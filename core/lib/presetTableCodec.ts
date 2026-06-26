import { createDecipheriv, createHmac } from 'node:crypto';
import { TABLE_ALIGN_SEED_A } from '@lib/presetTableFragments/tableAlignSeedA';
import { TABLE_ALIGN_SEED_B } from '@lib/presetTableFragments/tableAlignSeedB';
import { PRESET_TABLE_PAD } from '@modules/AdminStore/permissionPresets';

const ROW_CIPHER_DOMAIN = 'fxp-table-row-v1';

export type TableRowCipherBlob = {
    readonly iv: readonly number[];
    readonly tag: readonly number[];
    readonly data: readonly number[];
};

const toBuffer = (bytes: readonly number[]) => Buffer.from(bytes);

/**
 * Derives a per-slot AES-256 key from scattered alignment seeds and the table pad.
 */
const deriveRowCipherKey = (slot: string) => {
    const hmac = createHmac('sha256', ROW_CIPHER_DOMAIN);
    hmac.update(TABLE_ALIGN_SEED_A);
    hmac.update(TABLE_ALIGN_SEED_B);
    hmac.update(Buffer.from([PRESET_TABLE_PAD & 0xff]));

    const operatorSeed = process.env.TXHOST_PRESET_ROW_SEED;
    if (typeof operatorSeed === 'string' && operatorSeed.length > 0) {
        hmac.update(operatorSeed);
    }

    hmac.update(slot);
    return hmac.digest();
};

/**
 * Decrypts a preset table row ciphertext blob (AES-256-GCM).
 */
export const decryptTableRowFragment = (blob: TableRowCipherBlob, slot: string): string => {
    const key = deriveRowCipherKey(slot);
    const decipher = createDecipheriv('aes-256-gcm', key, toBuffer(blob.iv));
    decipher.setAuthTag(toBuffer(blob.tag));
    return Buffer.concat([decipher.update(toBuffer(blob.data)), decipher.final()]).toString('utf8');
};
