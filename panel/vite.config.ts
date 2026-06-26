import path from 'node:path';
import fs from 'node:fs';
import { visualizer } from 'rollup-plugin-visualizer';
import { PluginOption, UserConfig, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// import tsconfigPaths from 'vite-tsconfig-paths';
import { licenseBanner } from '../scripts/build/utils';
import { parseTxDevEnv } from '../shared/txDevEnv';
import { cefCssCompat } from './vite-plugins/cefCssCompat';
if (fs.existsSync(path.resolve(__dirname, '../.env'))) {
    process.loadEnvFile('../.env');
}

const txDevEnv = parseTxDevEnv();

const FONT_PACKAGES = ['inter', 'jetbrains-mono'] as const;

/**
 * Vite leaves @fontsource URLs as `./files/*.woff2` in the emitted CSS but does
 * not copy the binaries. NUI loads CSS from `nui://monitor/panel/` so those
 * files must exist beside the bundle.
 */
function copyPanelFontFiles(): PluginOption {
    return {
        name: 'copy-panel-font-files',
        closeBundle() {
            const outFilesDir = path.resolve(__dirname, '../monitor/panel/files');
            fs.mkdirSync(outFilesDir, { recursive: true });

            for (const pkg of FONT_PACKAGES) {
                const srcDir = path.resolve(__dirname, '../node_modules/@fontsource-variable', pkg, 'files');
                if (!fs.existsSync(srcDir)) {
                    console.warn(`[copy-panel-font-files] missing font package dir: ${srcDir}`);
                    continue;
                }
                for (const entry of fs.readdirSync(srcDir)) {
                    if (!entry.endsWith('.woff2')) continue;
                    fs.copyFileSync(path.join(srcDir, entry), path.join(outFilesDir, entry));
                }
            }
        },
    };
}

const baseConfig = {
    build: {
        // Align with FiveM NUI CEF (~Chrome 103); see nui/vite.config.ts and .github/MOTHERDOC.md
        target: 'chrome103',
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
                    if (id.includes('node_modules/fuse.js')) return 'fuse-vendor';
                    if (id.includes('node_modules/socket.io-client')) return 'socket-vendor';
                    if (id.includes('node_modules/react-markdown')) return 'markdown-vendor';
                    if (id.includes('node_modules/qrcode')) return 'qrcode-vendor';
                    if (id.includes('node_modules/zod')) return 'schemas';
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
        copyPanelFontFiles(),
        cefCssCompat(),
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
            '@locale': path.resolve(__dirname, '../locale'),
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
        baseConfig.build.sourcemap = false;
        // Strip crossorigin — FiveM's cfx-nui file server doesn't send CORS headers,
        // which causes Chromium to silently block crossorigin-mode resource fetches.
        (baseConfig.plugins as PluginOption[]).push({
            name: 'strip-crossorigin',
            transformIndexHtml(html: string) {
                return html.replace(/ crossorigin/g, '');
            },
        });
        return baseConfig;
    }
});
