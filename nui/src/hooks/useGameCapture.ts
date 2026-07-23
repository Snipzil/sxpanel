import { useEffect } from 'react';
import { startCapture, stopCapture, captureSingleFrame, warmupPipeline } from '../utils/gameCapture';
import { NUI_CALLBACK_URL } from '../utils/nuiGen';

/**
 * Hook that listens for NUI messages from Lua and delegates to the
 * game capture pipeline.  Handles both:
 *   - `takeScreenshot` (single frame, existing screenshot feature)
 *   - `startCapture` / `stopCapture` (continuous, live spectate)
 *
 * Initializes the persistent WebGL render loop on mount so CfxTexture
 * is always warm when a capture request arrives.
 */
export function useGameCapture() {
    useEffect(() => {
        // If the inline capture engine in index.html loaded first, defer to it.
        if ((window as any).__inlineCaptureEngine) {
            return;
        }

        // Start the persistent render loop immediately so CfxTexture is warm
        try {
            warmupPipeline();
        } catch (e) {
            console.error('[gameCapture] Warmup failed — CFX_THREE may not be loaded:', e);
        }

        const handleMessage = async (event: MessageEvent) => {
            const { action, data } = event.data ?? {};
            if (!action) return;

            if (action === 'startCapture') {
                startCapture(
                    data.sessionId,
                    (sessionId: string, frameData: string) => {
                        fetch(`${NUI_CALLBACK_URL}/spectateFrame`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                            body: JSON.stringify({ sessionId, frameData }),
                        }).catch(() => {});
                    },
                    {
                        fps: data.fps ?? 5,
                        quality: data.quality ?? 0.4,
                        resolutionScale: data.resolutionScale ?? 0.5,
                    },
                );
            } else if (action === 'stopCapture') {
                stopCapture();
            } else if (action === 'takeScreenshot') {
                let frame: string | null = null;
                let error: string | undefined;
                try {
                    frame = await captureSingleFrame(data?.quality ?? 0.5, 1.0, data?.encoding ?? 'jpg');
                    if (!frame) {
                        error = 'Capture returned empty frame.';
                    }
                } catch (e) {
                    error = String((e as Error)?.message ?? e);
                }

                const payload = frame
                    ? { requestId: data.requestId, data: frame }
                    : { requestId: data.requestId, error: error ?? 'Unknown capture error.' };

                fetch(`${NUI_CALLBACK_URL}/screenshotResult`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
                    body: JSON.stringify(payload),
                }).catch(() => {});
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);
}
