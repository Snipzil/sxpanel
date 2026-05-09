import crypto from 'node:crypto';
const modulename = 'WebCtxUtils';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { InjectedTxConsts, ThemeType } from '@shared/otherTypes';
import { txEnv, txDevEnv, txHostConfig } from '@core/globalData';
import { AuthedCtx, CtxWithVars } from './ctxTypes';
import consts from '@shared/consts';
import consoleFactory from '@lib/console';
import { getConfiguredServerIconPath } from '@lib/fxserver/fxsConfigHelper';
import { setRuntimeFile } from '@lib/fxserver/runtimeFiles';
import { AuthedAdminType, checkRequestAuth, resolveEffectiveAuthedAdmin } from './authLogic';
import { isString } from '@modules/CacheStore';
import { isPathInside } from '@modules/AddonManager/addonUtils';
import { PANEL_VAR_NAME_RE, PANEL_VAR_VALUE_RE, PANEL_VAR_FORBIDDEN_RE } from './cssVarSanitize';
const console = consoleFactory(modulename);

function htmlEscape(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeSerialize(obj: unknown): string {
    return JSON.stringify(obj)
        .replace(/<\/script/gi, '<\\/script')
        .replace(/<!--/g, '<\\!--')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// NOTE: it's not possible to remove the hardcoded import of the entry point in the index.html file
// even if you set the entry point manually in the vite config.
// Therefore, it was necessary to tag it with `data-prod-only` so it can be removed in dev mode.

//Consts
const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Cap inlined panel logo size; anything larger is skipped to avoid bloating
// the index.html response with a huge base64 blob (and to bound sync I/O).
const MAX_LOGO_BYTES = 100_000;

//Cache the index.html file unless in dev mode
let htmlFile: string;

// NOTE: https://vitejs.dev/guide/backend-integration.html
const viteOrigin = txDevEnv.VITE_URL ?? 'doesnt-matter';
const devModulesScript = `<script type="module">
        import { injectIntoGlobalHook } from "${viteOrigin}/@react-refresh";
        injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {};
        window.$RefreshSig$ = () => (type) => type;
        window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="${viteOrigin}/@vite/client"></script>
    <script type="module" src="${viteOrigin}/src/main.tsx"></script>`;

//Custom themes placeholder
export const tmpDefaultTheme = 'dark';
export const tmpDefaultThemes = ['dark', 'light'];
export const tmpCustomThemes: ThemeType[] = [
    // {
    //     name: 'deep-purple',
    //     isDark: true,
    //     style: {
    //         "background": "274 93% 39%",
    //         "foreground": "269 9% 100%",
    //         "card": "274 79% 53%",
    //         "card-foreground": "270 48% 99%",
    //         "popover": "240 10% 3.9%",
    //         "popover-foreground": "270 48% 99%",
    //         "primary": "270 48% 99%",
    //         "primary-foreground": "240 5.9% 10%",
    //         "secondary": "240 3.7% 15.9%",
    //         "secondary-foreground": "270 48% 99%",
    //         "muted": "240 3.7% 15.9%",
    //         "muted-foreground": "240 5% 64.9%",
    //         "accent": "240 3.7% 15.9%",
    //         "accent-foreground": "270 48% 99%",
    //         "destructive": "0 62.8% 30.6%",
    //         "destructive-foreground": "270 48% 99%",
    //         "border": "273 79%, 53%",
    //         "input": "240 3.7% 15.9%",
    //         "ring": "240 4.9% 83.9%",
    //     }
    // }
];

/**
 * Addon theme compatibility layer.
 * Reads `static/theme.json` from running addons and returns:
 *  - The addon's panel CSS inlined as a <style> tag
 *  - An additional <style> tag with CSS custom properties from theme.json
 *  - HTML attributes to apply on <html> (e.g. data-addon-themer-enabled)
 *
 * This allows theme addons to style the login page and other unauthenticated
 * views without their JS needing to run and without <link> tags (which would
 * fail the webAuthMw check on unauthenticated pages).
 */
async function getAddonThemeInjection(
    nonce: string,
): Promise<{ styleTags: string[]; htmlAttrs: string; logoDataUrl: string | undefined }> {
    const empty = { styleTags: [], htmlAttrs: '', logoDataUrl: undefined };
    try {
        const allAddons = txCore.addonManager.getAllAddons();
        for (const addon of allAddons) {
            if (addon.state !== 'running') continue;

            // Use resolveAddonStaticPath for safe path resolution
            const themePath = txCore.addonManager.resolveAddonStaticPath(addon.manifest.id, 'static', 'theme.json');
            if (!themePath) continue;

            let raw: string;
            try {
                raw = await fsp.readFile(themePath, 'utf-8');
            } catch {
                continue;
            }

            let config: any;
            try {
                config = JSON.parse(raw);
            } catch {
                continue;
            }

            if (!config || config.enabled !== true) continue;

            const panelVars = config.panel;
            if (!panelVars || typeof panelVars !== 'object') continue;

            const styleTags: string[] = [];

            // 1. Inline the addon's panel CSS file (if it has one)
            if (addon.manifest.panel?.styles) {
                try {
                    const cssPath = path.join(addon.dir, addon.manifest.panel.styles);
                    // Ensure the CSS file is inside the addon directory
                    const normalizedCss = path.resolve(cssPath);
                    const normalizedDir = path.resolve(addon.dir);
                    if (isPathInside(normalizedDir, normalizedCss)) {
                        const cssContent = (await fsp.readFile(normalizedCss, 'utf-8')).replace(
                            /<\/style/gi,
                            '<\\/style',
                        );
                        styleTags.push(`<style${nonce} data-addon-id="${addon.manifest.id}">${cssContent}</style>`);
                    }
                } catch {
                    // CSS file not found or unreadable — continue with just vars
                }
            }

            // 2. Build CSS custom property declarations from theme.json
            const cssDeclarations: string[] = [];
            for (const [name, value] of Object.entries(panelVars)) {
                if (typeof name !== 'string' || typeof value !== 'string') continue;
                const safeName = name.trim();
                if (!PANEL_VAR_NAME_RE.test(safeName)) continue;
                const safeValue = value.trim();
                if (!safeValue) continue;
                if (PANEL_VAR_FORBIDDEN_RE.test(safeValue)) continue;
                if (/[;<>{}]/.test(safeValue)) continue;
                if (!PANEL_VAR_VALUE_RE.test(safeValue)) continue;
                cssDeclarations.push(`${safeName}: ${safeValue};`);
            }

            if (cssDeclarations.length > 0) {
                styleTags.push(
                    `<style${nonce}>html[data-addon-themer-enabled='true'] {\n            ${cssDeclarations.join('\n            ')}\n        }</style>`,
                );
            }

            // 3. Resolve the panel logo as a data: URI so it works without auth
            let logoDataUrl: string | undefined;
            const logoFilename = config.branding?.panelLogo;
            if (typeof logoFilename === 'string' && logoFilename.trim()) {
                const logoPath = txCore.addonManager.resolveAddonStaticPath(
                    addon.manifest.id,
                    'static',
                    logoFilename.trim(),
                );
                if (logoPath) {
                    try {
                        const logoStat = await fsp.stat(logoPath);
                        if (logoStat.size > MAX_LOGO_BYTES) {
                            console.warn(
                                `Panel logo "${logoFilename}" is ${logoStat.size} bytes (max ${MAX_LOGO_BYTES}); skipping inline.`,
                            );
                        } else {
                            const logoBytes = await fsp.readFile(logoPath);
                            const ext = path.extname(logoFilename).toLowerCase();
                            const mimeMap: Record<string, string> = {
                                '.png': 'image/png',
                                '.jpg': 'image/jpeg',
                                '.jpeg': 'image/jpeg',
                                '.gif': 'image/gif',
                                '.svg': 'image/svg+xml',
                                '.webp': 'image/webp',
                                '.ico': 'image/x-icon',
                            };
                            const mime = mimeMap[ext];
                            if (!mime) {
                                console.warn(
                                    `Panel logo "${logoFilename}" has unsupported extension "${ext}"; skipping inline.`,
                                );
                            } else {
                                logoDataUrl = `data:${mime};base64,${logoBytes.toString('base64')}`;
                            }
                        }
                    } catch {
                        /* logo file unreadable */
                    }
                }
            }

            return {
                styleTags,
                htmlAttrs: 'data-addon-themer-enabled="true"',
                logoDataUrl,
            };
        }
    } catch (error) {
        console.verbose.warn(`Failed to generate addon theme injection: ${emsg(error)}`);
    }
    return empty;
}

const getConfiguredRuntimeServerIcon = async () => {
    const cachedIconFilename = txCore.cacheStore.getTyped('fxsRuntime:iconFilename', isString);
    if (typeof txConfig.server.cfgPath !== 'string' || typeof txConfig.server.dataPath !== 'string') {
        return cachedIconFilename;
    }

    try {
        const configuredIconPath = await getConfiguredServerIconPath(txConfig.server.cfgPath, txConfig.server.dataPath);
        if (!configuredIconPath) {
            return cachedIconFilename;
        }

        const iconBuffer = await fsp.readFile(configuredIconPath);
        const iconExt = path.extname(configuredIconPath).toLowerCase();
        const supportedIconExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico'];
        if (!supportedIconExts.includes(iconExt)) {
            console.verbose.warn(`Unsupported server icon format "${iconExt}" from ${configuredIconPath}`);
            return cachedIconFilename;
        }
        const iconHash = crypto
            .createHash('shake256', { outputLength: 8 })
            .update(iconBuffer)
            .digest('hex')
            .padStart(16, '0');
        const iconFilename = `icon-${iconHash}${iconExt}`;
        const runtimeIconPath = path.join(txEnv.txaPath, '.runtime', iconFilename);
        let runtimeIconExists = true;
        try {
            await fsp.access(runtimeIconPath);
        } catch {
            runtimeIconExists = false;
        }

        if (cachedIconFilename !== iconFilename || !runtimeIconExists) {
            const saved = await setRuntimeFile(iconFilename, iconBuffer);
            if (!saved) return cachedIconFilename;
            txCore.cacheStore.set('fxsRuntime:iconFilename', iconFilename);
        }

        return iconFilename;
    } catch (error) {
        console.verbose.warn(`Failed to load configured server icon: ${emsg(error)}`);
        return cachedIconFilename;
    }
};

/**
 * Returns the react index.html file with placeholders replaced
 * FIXME: add favicon
 */
export default async function getReactIndex(ctx: CtxWithVars | AuthedCtx) {
    //Read file if not cached
    if (txDevEnv.ENABLED || !htmlFile) {
        try {
            const indexPath = txDevEnv.ENABLED
                ? path.join(txDevEnv.SRC_PATH, '/panel/index.html')
                : path.join(txEnv.txaPath, 'panel/index.html');
            const rawHtmlFile = await fsp.readFile(indexPath, 'utf-8');

            //Remove tagged lines (eg hardcoded entry point) depending on env
            if (txDevEnv.ENABLED) {
                htmlFile = rawHtmlFile.replaceAll(/.+data-prod-only.+\r?\n/gm, '');
            } else {
                htmlFile = rawHtmlFile.replaceAll(/.+data-dev-only.+\r?\n/gm, '');
            }
            //Always remove dev-only safety script
            htmlFile = htmlFile.replaceAll(/.+data-always-remove[\s\S]*?<\/script>\r?\n/gm, '');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code == 'ENOENT') {
                return `<h1>⚠ index.html not found:</h1><pre>You probably deleted the 'citizen/system_resources/monitor/panel/index.html' file, or the folders above it.</pre>`;
            } else {
                return `<h1>⚠ index.html load error:</h1><pre>${emsg(error)}</pre>`;
            }
        }
    }

    //Checking if already logged in
    const authResult = checkRequestAuth(ctx.request.headers, ctx.ip, ctx.txVars.isLocalRequest, ctx.sessTools);
    let authedAdmin: AuthedAdminType | false = false;
    if (authResult.success) {
        authedAdmin = await resolveEffectiveAuthedAdmin(authResult.admin);
    }

    //Preparing vars
    const basePath = ctx.txVars.isWebInterface ? '/' : consts.nuiWebpipePath;

    //Compute addon theme injection early — the logo URL goes into txConsts
    const nonce = ctx.state.cspNonce ? ` nonce="${ctx.state.cspNonce}"` : '';
    const addonThemeResult = await getAddonThemeInjection(nonce);
    const serverIcon = await getConfiguredRuntimeServerIcon();

    const injectedConsts: InjectedTxConsts = {
        //env
        fxsVersion: txEnv.fxsVersionTag,
        fxsOutdated: txCore.updateChecker.fxsUpdateData,
        txaVersion: txEnv.txaVersion,
        txaOutdated: txCore.updateChecker.txaUpdateData,
        serverTimezone,
        isWindows: txEnv.isWindows,
        isWebInterface: ctx.txVars.isWebInterface,
        showAdvanced: txDevEnv.ENABLED || console.isVerbose,
        hasMasterAccount: txCore.adminStore.hasAdmins(true),
        defaultTheme: tmpDefaultTheme,
        customThemes: tmpCustomThemes.map(({ name, isDark }) => ({ name, isDark })),
        providerLogo: txHostConfig.providerLogo,
        providerName: txHostConfig.providerName,
        hostConfigSource: txHostConfig.sourceName,

        //Login page info
        server: {
            name: txCore.cacheStore.getTyped('fxsRuntime:projectName', isString) ?? txConfig.general.serverName,
            game: txCore.cacheStore.getTyped('fxsRuntime:gameName', isString),
            icon: serverIcon,
            desc: txCore.cacheStore.getTyped('fxsRuntime:projectDesc', isString),
        },
        hideFxsUpdateNotification: txConfig.general.hideFxsUpdateNotification,
        allowSelfIdentifierEdit: txConfig.general.allowSelfIdentifierEdit,
        discordOAuthEnabled: !!(txConfig.discordBot.oauthClientId && txConfig.discordBot.oauthClientSecret),

        //addon permissions
        addonPermissions: txCore.adminStore.getAddonPermissions(),

        //Addon theme compatibility
        addonThemeLogo: addonThemeResult.logoDataUrl,

        //auth
        preAuth: authedAdmin && authedAdmin.getAuthData(),
    };

    //Prepare placeholders
    const replacers: { [key: string]: string } = {};
    replacers.basePath = `<base href="${basePath}">`;
    replacers.ogTitle = `fxPanel - ${htmlEscape(txConfig.general.serverName)}`;
    replacers.ogDescripttion = `Manage & Monitor your FiveM/RedM Server with fxPanel v${txEnv.txaVersion} atop FXServer ${txEnv.fxsVersion}`;
    replacers.txConstsInjection = `<script${nonce}>window.txConsts = ${safeSerialize(injectedConsts)};</script>`;
    replacers.devModules = txDevEnv.ENABLED ? devModulesScript : '';

    //Prepare addon head tags (CSS for approved/running addons)
    //Only CSS is injected here — JS requires React globals set up by the panel app.
    //SECURITY: addon JS/CSS runs same-origin with the panel shell. Never inject
    //          <link> tags for unauthenticated visitors (e.g. on the login page)
    //          — doing so would fetch addon-controlled CSS into every request
    //          that hits index.html, broadening the attack surface.
    //          Theme CSS is instead inlined server-side below (getAddonThemeInjection).
    const addonTags: string[] = [];
    if (authedAdmin) {
        try {
            const panelManifest = txCore.addonManager.getPanelManifest();
            for (const addon of panelManifest) {
                if (addon.stylesUrl) {
                    addonTags.push(`<link rel="stylesheet" href="${addon.stylesUrl}" data-addon-id="${addon.id}">`);
                }
            }
        } catch (error) {
            console.verbose.warn(`Failed to generate addon head tags: ${emsg(error)}`);
        }
    }

    //Addon theme compatibility: inject inlined CSS + CSS vars from theme.json
    //so theming works on the login page (addon JS doesn't run there).
    for (const tag of addonThemeResult.styleTags) {
        addonTags.push(tag);
    }
    replacers.addonHeadTags = addonTags.join('\n        ');

    //Prepare custom themes style tag
    if (tmpCustomThemes.length) {
        const cssThemes = [];
        for (const theme of tmpCustomThemes) {
            const cssVars = [];
            for (const [name, value] of Object.entries(theme.style)) {
                cssVars.push(`--${name}: ${value};`);
            }
            cssThemes.push(`.theme-${theme.name} { ${cssVars.join(' ')} }`);
        }
        replacers.customThemesStyle = `<style${nonce}>${cssThemes.join('\n')}</style>`;
    } else {
        replacers.customThemesStyle = '';
    }

    //Setting data attributes for addon theming (e.g. data-addon-themer-enabled)
    replacers.htmlExtraAttrs = addonThemeResult.htmlAttrs;

    //Setting the theme class from the cookie
    const themeCookie = ctx.cookies.get('txAdmin-theme');
    if (themeCookie) {
        if (tmpDefaultThemes.includes(themeCookie)) {
            replacers.htmlClasses = themeCookie;
        } else {
            const selectedCustomTheme = tmpCustomThemes.find((theme) => theme.name === themeCookie);
            if (!selectedCustomTheme) {
                replacers.htmlClasses = tmpDefaultTheme;
            } else {
                const lightDarkSelector = selectedCustomTheme.isDark ? 'dark' : 'light';
                replacers.htmlClasses = `${lightDarkSelector} theme-${selectedCustomTheme.name}`;
            }
        }
    } else {
        replacers.htmlClasses = tmpDefaultTheme;
    }

    //Replace
    let htmlOut = htmlFile;
    for (const [placeholder, value] of Object.entries(replacers)) {
        const replacerRegex = new RegExp(`(<!--\\s*)?{{${placeholder}}}(\\s*-->)?`, 'g');
        htmlOut = htmlOut.replaceAll(replacerRegex, value);
    }

    //If in prod mode and NUI, replace the entry point with the local one
    //This is required because of how badly the WebPipe handles "large" files
    if (!txDevEnv.ENABLED) {
        const base = ctx.txVars.isWebInterface ? `./` : `nui://monitor/panel/`;
        htmlOut = htmlOut.replace(/src="\.\/index-(\w+(?:\.v\d+)?)\.js"/, `src="${base}index-$1.js"`);
        htmlOut = htmlOut.replace(/href="\.\/index-(\w+(?:\.v\d+)?)\.css"/, `href="${base}index-$1.css"`);
    }

    return htmlOut;
}
