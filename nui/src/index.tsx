import React from 'react';
import { createRoot } from 'react-dom/client';
import MenuWrapper from './MenuWrapper';
import './index.css';
import { ThemeProvider, StyledEngineProvider } from '@mui/material';
import { Provider as JotaiProvider } from 'jotai';
import { KeyboardNavProvider } from './provider/KeyboardNavProvider';
import { MaterialDesignContent, SnackbarProvider } from 'notistack';
import { registerDebugFunctions } from './utils/registerDebugFunctions';
import { useNuiEvent } from './hooks/useNuiEvent';
import { useGameCapture } from './hooks/useGameCapture';
import { styled } from '@mui/material/styles';
import { menuTheme, menuRedmTheme } from './styles/theme';
import { useIsRedm } from './state/isRedm.state';
import { useNuiAddonLoader } from './hooks/useNuiAddonLoader';

registerDebugFunctions();

//Redesigned toast chrome — same glass surface / hairline border / left accent
//stripe language as the menu rows and Stats tiles, instead of notistack's
//default flat MUI palette colors (which never got the menu's redesign pass).
//notistack's icon is a raw <svg fill="currentColor"> with no wrapper class
//(see MaterialDesignContent in notistack's source) — `color` on the svg
//itself (not inline, so overridable) drives the stripe-matching tint.
const StyledMaterialDesignContent = styled(MaterialDesignContent)(({ theme }) => {
    const stripeByVariant: Record<string, string> = {
        default: theme.tokens.textMuted,
        info: theme.tokens.info,
        success: theme.tokens.success,
        warning: theme.tokens.warning,
        error: theme.tokens.error,
    };

    const base = {
        '&.notistack-MuiContent': {
            color: theme.tokens.textPrimary,
            backgroundColor: theme.tokens.surface,
            border: `1px solid ${theme.tokens.border}`,
            borderRadius: theme.tokens.radiusRow,
            boxShadow: theme.tokens.shadowCard,
            position: 'relative' as const,
            overflow: 'hidden',
            paddingLeft: 14,
        },
        '&.notistack-MuiContent::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
        },
        '&.notistack-MuiContent #notistack-snackbar': {
            gap: 10,
        },
    };

    for (const [variant, color] of Object.entries(stripeByVariant)) {
        (base as Record<string, unknown>)[`&.notistack-MuiContent-${variant}::before`] = { background: color };
        (base as Record<string, unknown>)[`&.notistack-MuiContent-${variant} #notistack-snackbar > svg`] = { color };
    }

    return base;
});

const App = () => {
    const [isRedm, setIsRedm] = useIsRedm();

    useNuiEvent<string>('setGameName', (gameName: string) => {
        setIsRedm(gameName === 'redm');
    });

    // NOTE: Screenshot & live spectate capture is handled by the inline script
    // in index.html (before React loads), mirroring the fivem-watch approach.
    // The React hook acts as a fallback in case the inline script didn't load.
    useGameCapture();

    // Load NUI addons (styles + scripts) from the addon manifest
    useNuiAddonLoader();

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={isRedm ? menuRedmTheme : menuTheme}>
                <KeyboardNavProvider>
                    <SnackbarProvider
                        maxSnack={5}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                        disableWindowBlurListener={true}
                        Components={{
                            default: StyledMaterialDesignContent,
                            info: StyledMaterialDesignContent,
                            success: StyledMaterialDesignContent,
                            warning: StyledMaterialDesignContent,
                            error: StyledMaterialDesignContent,
                        }}
                    >
                        <React.Suspense fallback={<></>}>
                            <MenuWrapper />
                        </React.Suspense>
                    </SnackbarProvider>
                </KeyboardNavProvider>
            </ThemeProvider>
        </StyledEngineProvider>
    );
};

const rootContainer = document.getElementById('root');
if (!rootContainer) {
    throw new Error('Root element #root not found');
}
const root = createRoot(rootContainer);
root.render(
    <JotaiProvider>
        <App />
    </JotaiProvider>,
);
