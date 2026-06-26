import '@mui/material/styles';
import type { MenuTokens } from './theme';

declare module '@mui/material/styles' {
    interface Theme {
        name: string;
        logo: string;
        tokens: MenuTokens;
    }

    // allow configuration using `createTheme`
    interface ThemeOptions {
        name?: string;
        logo?: string;
        tokens?: MenuTokens;
    }
}
