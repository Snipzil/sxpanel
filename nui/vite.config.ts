import path from 'node:path';
import fs from 'node:fs';
import { visualizer } from 'rollup-plugin-visualizer';
import { PluginOption, UserConfig, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { getFxsPaths, licenseBanner } from '../scripts/build/utils';
import { parseTxDevEnv } from '../shared/txDevEnv';
if (fs.existsSync(path.resolve(__dirname, '../.env'))) {
    process.loadEnvFile('../.env');
}

const txDevEnv = parseTxDevEnv();

const baseConfig = {
    build: {
        emptyOutDir: true,
        reportCompressedSize: false,
        outDir: '../monitor/nui',
        minify: true as boolean,
        target: 'chrome103',
        sourcemap: false,

        rollupOptions: {
            output: {
                banner: licenseBanner('..', true),
                //Doing this because fxserver's cicd doesn't wipe the monitor folder
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: '[name].[ext]',
            },
        },
    },
    base: '/nui/',
    clearScreen: false,
    resolve: {
        tsconfigPaths: true,
    },
    plugins: [
        react(),
        visualizer({
            // template: 'flamegraph',
            // template: 'sunburst',
            gzipSize: true,
            filename: '../.reports/nui_bundle.html',
        }),
    ] as PluginOption[], //i gave up
} satisfies UserConfig;

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
    if (mode === 'devNuiBrowser') {
        console.log('Launching NUI in browser mode');
        return baseConfig;
    }

    if (mode === 'development') {
        if (!txDevEnv.FXSERVER_PATH) {
            console.error('Missing TXDEV_FXSERVER_PATH env variable.');
            process.exit(1);
        }
        let devDeplyPath: string;
        try {
            //Extract paths and validate them
            const fxsPaths = getFxsPaths(txDevEnv.FXSERVER_PATH);
            devDeplyPath = path.join(fxsPaths.monitor, 'nui');
        } catch (error) {
            console.error('Could not extract/validate the fxserver and monitor paths.');
            console.error(error);
            process.exit(1);
        }

        baseConfig.build.outDir = devDeplyPath;
        baseConfig.build.minify = false;

        //DEBUG sourcemap is super slow
        // baseConfig.build.sourcemap = true;
        return baseConfig;
    } else {
        baseConfig.base = './';
        // Strip crossorigin attrs — FiveM's cfx-nui file server doesn't send CORS headers,
        // which causes Chromium to silently block crossorigin-mode resource fetches.
        (baseConfig.plugins as any[]).push({
            name: 'strip-crossorigin',
            transformIndexHtml(html: string) {
                return html.replace(/ crossorigin/g, '');
            },
        });
        // Ensure cfx-three.min.js script tag is present in the built HTML.
        // Vite strips non-module <script> tags during build, so we re-inject it.
        (baseConfig.plugins as any[]).push({
            name: 'inject-cfx-three',
            transformIndexHtml(html: string) {
                if (!html.includes('cfx-three')) {
                    return html.replace(
                        '<div id="root"></div>',
                        '<div id="root"></div>\n  <script src="nui://monitor/nui/cfx-three.min.js"></script>',
                    );
                }
                return html;
            },
        });
        return baseConfig;
    }
});
