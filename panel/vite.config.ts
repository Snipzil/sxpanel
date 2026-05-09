import path from 'node:path';
import fs from 'node:fs';
import { visualizer } from 'rollup-plugin-visualizer';
import { PluginOption, UserConfig, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import tsconfigPaths from 'vite-tsconfig-paths';
import { licenseBanner } from '../scripts/build/utils';
import { parseTxDevEnv } from '../shared/txDevEnv';
if (fs.existsSync(path.resolve(__dirname, '../.env'))) {
    process.loadEnvFile('../.env');
}

const txDevEnv = parseTxDevEnv();

const baseConfig = {
    build: {
        emptyOutDir: true,
        outDir: '../monitor/panel',
        minify: true,
        sourcemap: undefined, // placeholder

        // generate manifest.json in outDir
        manifest: true,
        rollupOptions: {
            input: undefined, //placeholder

            output: {
                banner: licenseBanner('..', true),
                //Adding hash to help with cache busting
                hashCharacters: 'base36',
                entryFileNames: `[name]-[hash].v800.js`,
                chunkFileNames: `[name]-[hash].v800.js`,
                assetFileNames: '[name]-[hash].v800.[ext]',
                // Manual chunks for better code splitting
                manualChunks(id) {
                    if (id.includes('@monaco-editor/react')) return 'monaco-editor';
                    if (id.includes('@nivo/')) return 'nivo-charts';
                    if (id.includes('d3-scale-chromatic') || id.includes('d3-color') || id.includes('node_modules/d3/'))
                        return 'd3-vendor';
                    if (
                        id.includes('@xterm/xterm') ||
                        id.includes('@xterm/addon-fit') ||
                        id.includes('@xterm/addon-search') ||
                        id.includes('@xterm/addon-web-links') ||
                        id.includes('@xterm/addon-webgl')
                    )
                        return 'xterm-vendor';
                },
            },
        },
    },
    server: {
        origin: undefined, //placeholder
    },
    base: '',
    clearScreen: false,
    plugins: [
        react(),
        visualizer({
            // template: 'flamegraph',
            // template: 'sunburst',
            gzipSize: true,
            filename: '../.reports/panel_bundle.html',
        }),
    ] as PluginOption[], //i gave up
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@shared': path.resolve(__dirname, '../shared'),
        },
    },
} satisfies UserConfig;

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
    if (command === 'serve') {
        if (!txDevEnv.VITE_URL) {
            console.error('Missing TXDEV_VITE_URL env variable.');
            process.exit(1);
        }
        baseConfig.server.origin = txDevEnv.VITE_URL;
        baseConfig.build.rollupOptions.input = './src/main.tsx'; // overwrite default .html entry
        return baseConfig;
    } else {
        baseConfig.build.sourcemap = true;
        return baseConfig;
    }
});
