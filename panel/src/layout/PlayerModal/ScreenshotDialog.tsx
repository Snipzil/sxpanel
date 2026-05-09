import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2Icon, DownloadIcon } from 'lucide-react';

type ScreenshotDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    imageData: string | null;
    loading: boolean;
    error: string | null;
    playerName: string;
};

export default function ScreenshotDialog({
    open,
    onOpenChange,
    imageData,
    loading,
    error,
    playerName,
}: ScreenshotDialogProps) {
    const imageSrc = imageData
        ? imageData.startsWith('data:')
            ? imageData
            : `data:image/jpeg;base64,${imageData}`
        : null;

    const handleDownload = () => {
        if (!imageSrc) return;
        const link = document.createElement('a');
        link.href = imageSrc;
        link.download = `screenshot_${playerName}_${Date.now()}.webp`;
        link.click();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl [&>button.absolute]:hidden">
                <DialogHeader>
                    <div className="flex items-center justify-between">
                        <DialogTitle>Screenshot — {playerName}</DialogTitle>
                        <DialogDescription className="sr-only">
                            Screenshot capture of player {playerName}
                        </DialogDescription>
                        {imageSrc && (
                            <Button variant="outline" size="sm" onClick={handleDownload}>
                                <DownloadIcon className="mr-1 h-4 w-4" /> Save
                            </Button>
                        )}
                    </div>
                </DialogHeader>
                <div className="flex min-h-[300px] items-center justify-center">
                    {loading && (
                        <div className="text-muted-foreground flex flex-col items-center gap-2">
                            <Loader2Icon className="h-8 w-8 animate-spin" />
                            <span className="text-sm">Capturing screenshot...</span>
                        </div>
                    )}
                    {error && <p className="text-destructive text-center">{error}</p>}
                    {imageSrc && !loading && (
                        <img
                            src={imageSrc}
                            alt={`Screenshot of ${playerName}`}
                            className="max-h-[70vh] max-w-full rounded-lg border"
                        />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
