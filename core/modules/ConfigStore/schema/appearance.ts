import { z } from 'zod';
import { typeDefinedConfig } from './utils';
import { SYM_FIXER_FATAL } from '@lib/symbols';
import { alphanumeric } from 'nanoid-dictionary';
import { customAlphabet } from 'nanoid';
import { HSL_TRIPLE_REGEX, THEME_COLOR_TOKEN_KEYS } from '@shared/themeTokens';

/**
 * MARK: Custom themes
 */
export const CUSTOM_THEME_ID_LENGTH = 21;

export const genCustomThemeId = customAlphabet(alphanumeric, CUSTOM_THEME_ID_LENGTH);

const hslTripleValidator = z.string().regex(HSL_TRIPLE_REGEX, 'Expected an "H S% L%" HSL triple, eg "217 91% 60%".');

const themeStyleShape = Object.fromEntries(THEME_COLOR_TOKEN_KEYS.map((key) => [key, hslTripleValidator])) as Record<
    (typeof THEME_COLOR_TOKEN_KEYS)[number],
    typeof hslTripleValidator
>;

export const CustomThemeDataSchema = z.object({
    id: z.string().length(CUSTOM_THEME_ID_LENGTH),
    name: z.string().min(1).max(30),
    isDark: z.boolean(),
    style: z.object(themeStyleShape),
});
export type CustomThemeDataType = z.infer<typeof CustomThemeDataSchema>;

//Ensures all themes have unique ids and names
export const polishCustomThemesArray = (input: CustomThemeDataType[]) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const unique: CustomThemeDataType[] = [];
    for (const theme of input) {
        let polished = theme;
        if (ids.has(polished.id)) {
            polished = { ...polished, id: genCustomThemeId() };
        }
        ids.add(polished.id);

        if (names.has(polished.name)) {
            let suffix = 2;
            let candidate = `${polished.name} (${suffix})`;
            while (names.has(candidate)) {
                suffix++;
                candidate = `${polished.name} (${suffix})`;
            }
            polished = { ...polished, name: candidate };
        }
        names.add(polished.name);

        unique.push(polished);
    }
    return unique;
};

const customThemes = typeDefinedConfig({
    name: 'Custom Themes',
    default: [],
    validator: CustomThemeDataSchema.array().transform(polishCustomThemesArray),
    //NOTE: if the config file got manually broken, we don't want to wipe out custom themes
    fixer: SYM_FIXER_FATAL,
});

export default {
    customThemes,
} as const;
