import { randomInt } from 'node:crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_+=';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const TEMP_PASSWORD_LENGTH = 22;

const pickChar = (alphabet: string) => alphabet[randomInt(alphabet.length)]!;

const shuffle = (chars: string[]) => {
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join('');
};

/**
 * Generates a one-time temporary admin password with guaranteed character-class coverage.
 */
export function generateTempAdminPassword(length = TEMP_PASSWORD_LENGTH): string {
    const required = [pickChar(UPPER), pickChar(LOWER), pickChar(DIGITS), pickChar(SYMBOLS)];
    while (required.length < length) {
        required.push(pickChar(ALL));
    }
    return shuffle(required);
}
