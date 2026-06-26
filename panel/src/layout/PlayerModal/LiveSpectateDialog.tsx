import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '@/lib/utils';
import type { SpectateFrameEventData } from '@shared/spectateApiTypes';
import { useLocale } from '@/hooks/locale';

type LiveSpectateDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sessionId: string | null;
    playerName: string;
    onStop: () => void;
    error: string | null;
};

export default function LiveSpectateDialog({
    open,
    onOpenChange,
    sessionId,
    playerName,
    onStop,
    error,
}: LiveSpectateDialogProps) {
    const { t } = useLocale();
    const [currentFrame, setCurrentFrame] = useState<string | null>(null);
    const [connectionTimedOut, setConnectionTimedOut] = useState(false);
    const cleanupRef = useRef<(() => void) | null>(null);

    // 20 second connection timeout — if no frames arrive, show error
    useEffect(() => {
        if (!open || !sessionId || currentFrame || error) return;
        const timer = setTimeout(() => {
            setConnectionTimedOut(true);
        }, 20_000);
        return () => clearTimeout(timer);
    }, [open, sessionId, currentFrame, error]);

    useEffect(() => {
        if (!open || !sessionId) return;

        const socket = getSocket();
        socket.emit('joinSpectate' as any, sessionId);

        const handleFrame = (data: SpectateFrameEventData) => {
            if (data.sessionId === sessionId) {
                setCurrentFrame(data.frame);
            }
        };

        socket.on('spectateFrame', handleFrame);

        const cleanup = () => {
            socket.off('spectateFrame', handleFrame);
            socket.emit('leaveSpectate' as any, sessionId);
        };

        cleanupRef.current = cleanup;

        return () => {
            cleanup();
            if (cleanupRef.current === cleanup) {
                cleanupRef.current = null;
            }
        };
    }, [open, sessionId]);

    const handleStop = useCallback(() => {
        cleanupRef.current?.();
        cleanupRef.current = null;
        setCurrentFrame(null);
        setConnectionTimedOut(false);
        onStop();
    }, [onStop]);

    const handleOpenChange = useCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                handleStop();
            }
            onOpenChange(isOpen);
        },
        [onOpenChange, handleStop],
    );

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-5xl [&>button.absolute]:hidden">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle>{t('panel.player_modal.spectate.title', { name: playerName })}</DialogTitle>
                        <DialogDescription className="sr-only">
                            {t('panel.player_modal.spectate.description', { name: playerName })}
                        </DialogDescription>
                        <Button variant="destructive" size="sm" onClick={handleStop}>
                            {t('panel.common.stop')}
                        </Button>
                    </div>
                </DialogHeader>
                <div className="flex min-h-[400px] items-center justify-center rounded-lg bg-zinc-950">
                    {!currentFrame && !error && !connectionTimedOut && (
                        <div className="text-muted-foreground flex flex-col items-center gap-2">
                            <Loader2Icon className="size-8 animate-spin" />
                            <span className="text-sm">{t('panel.player_modal.spectate.connecting')}</span>
                        </div>
                    )}
                    {(error || connectionTimedOut) && (
                        <p className="text-destructive text-center">
                            {error ?? t('panel.player_modal.spectate.timeout')}
                        </p>
                    )}
                    {currentFrame && (
                        <img
                            src={currentFrame}
                            alt={t('panel.player_modal.spectate.alt', { name: playerName })}
                            className="max-h-[75vh] max-w-full"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
