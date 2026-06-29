import React, { useState } from 'react';
import { alpha, styled, useTheme } from '@mui/material/styles';
import { Box, Fade, Typography } from '@mui/material';
import { useNuiEvent } from '../../hooks/useNuiEvent';
import { useTranslate } from 'react-polyglot';
import { debugData } from '../../utils/debugData';
import { ReportProblemOutlined } from '@mui/icons-material';

/**
 * Warn box
 */
const boxClasses = {
    root: `WarnBox-root`,
    inner: `WarnBox-inner`,
    title: `WarnBox-title`,
    message: `WarnBox-message`,
    author: `WarnBox-author`,
    instruction: `WarnBox-instruction`,
};

const WarnInnerStyles = styled('div')(({ theme }) => ({
    color: theme.tokens.textPrimary,
    transition: 'transform 300ms ease-in-out',
    maxWidth: '700px',
    width: 'calc(100vw - 48px)',
    boxSizing: 'border-box',
    overflowWrap: 'anywhere',

    [`& .${boxClasses.inner}`]: {
        padding: 32,
        border: `3px dashed ${theme.tokens.textPrimary}`,
        borderRadius: theme.tokens.radiusCard,
    },
    [`& .${boxClasses.title}`]: {
        display: 'flex',
        margin: '-20px auto 18px auto',
        width: 'fit-content',
        maxWidth: '100%',
        borderBottom: `2px solid ${theme.tokens.textPrimary}`,
        paddingBottom: 5,
        fontWeight: 700,
        letterSpacing: '0.02em',
        alignItems: 'center',
        overflowWrap: 'normal',
    },
    [`& .${boxClasses.message}`]: {
        fontSize: '1.5em',
        lineHeight: 1.5,
        overflowWrap: 'anywhere',
    },
    [`& .${boxClasses.author}`]: {
        textAlign: 'right',
        fontSize: '0.8em',
        marginTop: 15,
        marginBottom: -15,
    },
    [`& .${boxClasses.instruction}`]: {
        marginTop: '1em',
        textAlign: 'center',
        opacity: 0.85,
    },
}));

interface WarnInnerComp {
    message: string;
    warnedBy: string;
    isWarningNew: boolean;
    secsRemaining: number;
    resetCounter: number;
}

const WarningIcon = () => {
    const theme = useTheme();
    return (
        <ReportProblemOutlined
            style={{
                color: theme.palette.warning.light,
                padding: '0 4px 0 4px',
                height: '3rem',
                width: '3rem',
            }}
        />
    );
};

const WarnInnerComp: React.FC<WarnInnerComp> = ({ message, warnedBy, isWarningNew, secsRemaining, resetCounter }) => {
    const t = useTranslate();
    const theme = useTheme();
    const instructionFontSize = Math.min(1.5, 0.9 + resetCounter * 0.15);

    const [iHead, iTail] = t('nui_warning.instruction', {
        key: '%R%',
        smart_count: secsRemaining,
    }).split('%R%', 2);

    const iKey = (
        <span
            style={{
                padding: '0.15rem 0.35rem',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                fontFamily: 'monospace',
                fontSize: '1.25em',
                letterSpacing: 1,
                borderRadius: 4,
                fontWeight: 600,
            }}
        >
            {t('nui_warning.dismiss_key')}
        </span>
    );

    return (
        <>
            <WarnInnerStyles className={boxClasses.root}>
                <Box className={boxClasses.inner}>
                    <Box className={boxClasses.title}>
                        <WarningIcon />
                        <Typography variant="h3" style={{ fontWeight: 700 }}>
                            {t('nui_warning.title')}
                        </Typography>
                        <WarningIcon />
                    </Box>
                    <Typography
                        letterSpacing={1}
                        variant="h5"
                        style={{
                            textAlign: 'center',
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                        }}
                    >
                        {message}
                    </Typography>
                    <Typography
                        letterSpacing={1}
                        style={{
                            textAlign: 'right',
                            marginBottom: -20,
                            opacity: 0.85,
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                        }}
                        variant="body2"
                    >
                        {t('nui_warning.warned_by')} {warnedBy}
                    </Typography>
                </Box>
                {!isWarningNew ? (
                    <Box className={boxClasses.instruction} fontWeight={600} letterSpacing={1}>
                        {t('nui_warning.stale_message')}
                    </Box>
                ) : null}
            </WarnInnerStyles>
            <Box>
                <span
                    style={{
                        display: 'block',
                        maxWidth: 'calc(100vw - 48px)',
                        color: theme.tokens.textPrimary,
                        fontSize: `${instructionFontSize}em`,
                        textAlign: 'center',
                        overflowWrap: 'anywhere',
                    }}
                >
                    {iHead} {iKey} {iTail}
                </span>
            </Box>
        </>
    );
};

/**
 * Main warn container (whole page)
 */
const mainClasses = {
    root: `MainWarn-root`,
    miniBounce: `MainWarn-miniBounce`,
};

const MainPageStyles = styled('div')(({ theme }) => {
    //Deliberately alarming deep red, derived from the error palette
    const warnRed = theme.palette.error.dark;
    return {
        [`& .${mainClasses.root}`]: {
            top: 0,
            left: 0,
            transition: 'background-color 750ms ease-in-out',
            position: 'absolute',
            height: '100vh',
            width: '100vw',
            display: 'flex',
            flexDirection: 'column',
            gap: '1em',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: alpha(warnRed, 0.95),
        },
        '@keyframes miniBounce': {
            '0%': {
                backgroundColor: alpha(warnRed, 0.95),
            },
            '30%': {
                backgroundColor: alpha(warnRed, 0.6),
            },
            '60%': {
                backgroundColor: alpha(warnRed, 0.3),
            },
            '70%': {
                backgroundColor: alpha(warnRed, 0.6),
            },
            '100%': {
                backgroundColor: alpha(warnRed, 0.95),
            },
        },
        [`& .${mainClasses.miniBounce}`]: {
            animation: 'miniBounce 500ms ease-in-out',
        },
    };
});

export interface SetWarnOpenData {
    reason: string;
    warnedBy: string;
    isWarningNew: boolean;
}

const pulseSound = new Audio('sounds/warning_pulse.mp3');
const openSound = new Audio('sounds/warning_open.mp3');

export const WarnPage: React.FC = ({}) => {
    const [isMiniBounce, setIsMiniBounce] = useState(false);

    const [isOpen, setIsOpen] = useState(false);
    const [warnData, setWarnData] = useState<SetWarnOpenData | null>(null);
    const [secsRemaining, setSecsRemaining] = useState(10);
    const [resetCounter, setResetCounter] = useState(0);

    useNuiEvent<SetWarnOpenData>('setWarnOpen', (warnData) => {
        setWarnData(warnData);
        setSecsRemaining(10);
        setResetCounter(0);
        setIsOpen(true);
        openSound.play();
    });

    useNuiEvent<number>('pulseWarning', (secsRemaining) => {
        setSecsRemaining(secsRemaining);
        setIsMiniBounce(true);
        pulseSound.play();
        setTimeout(() => {
            setIsMiniBounce(false);
        }, 500);
    });

    useNuiEvent('resetWarning', () => {
        setSecsRemaining(10);
        setResetCounter((prev) => prev + 1);
        pulseSound.pause();
        pulseSound.currentTime = 0;
        openSound.pause();
        openSound.currentTime = 0;
        openSound.play();
    });

    useNuiEvent('closeWarning', () => {
        setIsOpen(false);
    });

    const exitHandler = () => {
        pulseSound.play();
    };

    return (
        <MainPageStyles>
            <Fade in={isOpen} onExit={exitHandler}>
                <Box className={!isMiniBounce ? mainClasses.root : `${mainClasses.root} ${mainClasses.miniBounce}`}>
                    <WarnInnerComp
                        message={warnData?.reason ?? ''}
                        warnedBy={warnData?.warnedBy ?? ''}
                        isWarningNew={warnData?.isWarningNew ?? true}
                        secsRemaining={secsRemaining}
                        resetCounter={resetCounter}
                    />
                </Box>
            </Fade>
        </MainPageStyles>
    );
};

/**
 * Browser mock
 */
// debugData([
//   {
//     action: 'setWarnOpen',
//     data: {
//       reason: 'Stop doing bad things 😠',
//       warnedBy: 'Tabby',
//       isWarningNew: false,
//     }
//   }
// ], 500)
// setInterval(() => {
//   debugData([
//     {
//       action: 'pulseWarning',
//       data: {}
//     }
//   ]);
// }, 1000);
// debugData([
//   {
//     action: 'closeWarning',
//     data: {}
//   }
// ], 2_000);
