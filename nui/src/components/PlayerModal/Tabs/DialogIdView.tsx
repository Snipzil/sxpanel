import React from 'react';
import { styled } from '@mui/material/styles';
import { Box, IconButton, Typography } from '@mui/material';
import { usePlayerDetailsValue } from '../../../state/playerDetails.state';
import { FileCopy } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useTranslate } from 'react-polyglot';
import { DialogLoadError } from './DialogLoadError';
import { copyToClipboard } from '../../../utils/copyToClipboard';

const PREFIX = 'DialogIdView';

const classes = {
    codeBlock: `${PREFIX}-codeBlock`,
    codeBlockText: `${PREFIX}-codeBlockText`,
    codeBlockHwids: `${PREFIX}-codeBlockHwids`,
};

const StyledBox = styled(Box)(({ theme }) => ({
    [`& .${classes.codeBlock}`]: {
        background: theme.palette.background.paper,
        borderRadius: 8,
        padding: '0px 15px',
        marginBottom: 7,
        display: 'flex',
        alignItems: 'center',
    },

    [`& .${classes.codeBlockText}`]: {
        flexGrow: 1,
        fontFamily: 'monospace',
    },

    [`& .${classes.codeBlockHwids}`]: {
        flexGrow: 1,
        fontFamily: 'monospace',
        padding: '15px 0px',
        fontSize: '0.95rem',
        opacity: '0.75',
    },
}));

const sanitiseIdentifier = (value: unknown) => {
    if (typeof value !== 'string') return '';
    return value.replace(/[^a-zA-Z0-9:_./+\-=]/g, '').trim();
};

const DialogIdView: React.FC = () => {
    const playerDetails = usePlayerDetailsValue();
    const { enqueueSnackbar } = useSnackbar();
    const t = useTranslate();
    if ('error' in playerDetails) return <DialogLoadError />;

    const currentIds = (playerDetails.player.ids ?? []).map(sanitiseIdentifier).filter(Boolean);
    const allIds = Array.from(
        new Set([...(playerDetails.player.oldIds ?? []).map(sanitiseIdentifier), ...currentIds]),
    ).filter(Boolean);

    const handleCopyToClipboard = (value: string) => {
        const safeValue = sanitiseIdentifier(value);
        if (!safeValue) return;
        const wasCopied = copyToClipboard(safeValue, true);
        enqueueSnackbar(t(wasCopied ? 'nui_menu.common.copied' : 'nui_menu.common.error'), {
            variant: wasCopied ? 'info' : 'error',
        });
    };

    const getAllIds = () => {
        if (!allIds.length) {
            return <em>No identifiers saved.</em>;
        } else {
            return allIds.map((ident) => {
                const isCurrent = currentIds.includes(ident);

                return (
                    <Box className={classes.codeBlock} key={ident} sx={{ opacity: isCurrent ? 1 : 0.65 }}>
                        <Typography className={classes.codeBlockText} sx={{ fontWeight: isCurrent ? 700 : 400 }}>
                            {ident}
                        </Typography>
                        <IconButton onClick={() => handleCopyToClipboard(ident)} size="large">
                            <FileCopy />
                        </IconButton>
                    </Box>
                );
            });
        }
    };

    const getAllHwids = () => {
        const safeHwids = Array.isArray(playerDetails.player.oldHwids)
            ? playerDetails.player.oldHwids.map(sanitiseIdentifier).filter(Boolean)
            : [];
        if (!safeHwids.length) {
            return <em>No HWIDs saved.</em>;
        } else {
            return (
                <Box className={classes.codeBlock}>
                    <span className={classes.codeBlockHwids}>{safeHwids.join('\n')}</span>
                </Box>
            );
        }
    };

    return (
        <StyledBox overflow="auto" height="100%" padding="8px 24px">
            <Typography variant="h6" sx={{ mb: 1 }}>
                All Identifiers:
            </Typography>
            <Box sx={{ mb: 2 }}>{getAllIds()}</Box>

            <Typography variant="h6" sx={{ mb: 1 }}>
                {t('nui_menu.player_modal.ids.all_hwids')}:
            </Typography>
            <Box sx={{ mb: 2 }}>{getAllHwids()}</Box>
        </StyledBox>
    );
};

export default DialogIdView;
