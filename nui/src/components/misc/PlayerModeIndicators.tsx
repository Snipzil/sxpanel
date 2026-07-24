import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { SvgIconProps } from '@mui/material/SvgIcon';
import { AirlineStopsOutlined, ControlCameraOutlined, SecurityOutlined } from '@mui/icons-material';
import { useTranslate } from 'react-polyglot';
import { usePlayerModeIndicatorsValue } from '../../state/playerModeIndicators.state';

const ICONS_BY_KEY: Record<string, React.ComponentType<SvgIconProps>> = {
    godModeEnabled: SecurityOutlined,
    noClipEnabled: ControlCameraOutlined,
    superJumpEnabled: AirlineStopsOutlined,
};

/**
 * Small badges for long-lived player-mode toggles (god mode, noclip, super
 * jump), sitting above the page tabs. These used to be full persistent
 * snackbars camping at the bottom of the screen for the whole session — this
 * is the unobtrusive replacement, with the full message available on hover.
 */
export const PlayerModeIndicators: React.FC = () => {
    const t = useTranslate();
    const indicators = usePlayerModeIndicatorsValue();

    if (!indicators.length) return null;

    return (
        <Box
            sx={{
                display: 'flex',
                gap: 1,
                mb: 1,
            }}
        >
            {indicators.map(({ key, message, isTranslationKey, tOptions }) => {
                const Icon = ICONS_BY_KEY[key] ?? SecurityOutlined;
                const label = isTranslationKey ? t(message, tOptions) : message;
                return (
                    <Tooltip key={key} title={label} placement="top" arrow>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 30,
                                height: 30,
                                borderRadius: (theme) => theme.tokens.radiusPill,
                                backgroundColor: (theme) => theme.tokens.surface,
                                border: (theme) => `1px solid ${theme.tokens.borderStrong}`,
                                boxShadow: (theme) => theme.tokens.shadowCard,
                                color: (theme) => theme.tokens.accent,
                                '& svg': {
                                    fontSize: 16,
                                },
                            }}
                        >
                            <Icon fontSize="inherit" />
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
};
