/**

 * FiveM CEF compatibility layer for the panel SPA.

 *

 * The in-game Panel tab loads this same bundle inside CEF ~Chrome 103. The external

 * browser panel does not. Compatibility is split across four boundaries:

 *

 * **Build time** (`panel/vite-plugins/cefCssCompat.ts`)

 * - Rewrites Tailwind v4 `color-mix()` opacity utilities to CEF-safe CSS

 * - Dedupes full-opacity fallback rules when calc opacity rules exist

 * - Strips `crossorigin` from script/link tags (cfx-nui file server)

 * - Compiles JS with `build.target: 'chrome103'`

 * - CI: `npm run verify:cef-css -w panel` asserts `color-mix()` count === 0

 *

 * **Runtime** (`polyfills.ts`, `runtime.ts` — import via `installPanelCefCompat()` in `main.tsx`)

 * - Polyfills: `toSorted`, `toReversed`, `toSpliced`, `with`, `Promise.withResolvers`, `Object.groupBy`

 * - Detection: `isFiveMNuiPanel()`, `isCefPanelEmbed()`, `isCefPanelRuntime()`

 *

 * **Embed** (`panel/src/lib/nuiEmbed.ts`)

 * - Viewport sizing, Escape/Tab bridge, asset URL resolution for the menu iframe

 *

 * **Server** (`core/modules/WebServer/getReactIndex.ts`)

 * - NUI HTML via WebPipe; bundle URLs rewritten to `cfx-nui-monitor/panel/`

 *

 * Do not raise `build.target` above Chrome 103 without verifying a newer FiveM artifact.

 *

 * --- In-game smoke checklist (manual QA after deploy) ---

 * - [ ] Panel tab loads; JS/CSS/fonts from `cfx-nui-monitor/panel/` (no text/html MIME errors)

 * - [ ] `/` Dashboard — charts render (nivo/d3)

 * - [ ] `/server/player-drops` — no console crash on load

 * - [ ] `/server/live-console` — xterm usable (or acceptable degradation)

 * - [ ] `/settings/*` — forms usable; Monaco editors load or show fallback

 * - [ ] Sidebar active item — accent tint, not solid pink

 * - [ ] Server Start/Stop/Restart — icons visible on tinted buttons

 * - [ ] Toast trigger — readable background, border, text, icons

 * - [ ] Escape closes menu; Tab cycles menu tabs from inside iframe

 * - [ ] Copy-to-clipboard (e.g. player ID) works via textarea fallback

 * - [ ] External links open in system browser via `invokeNative('openUrl')`

 */

import { installCefPolyfills } from './polyfills';

export { FIVEM_CEF_CHROME_VERSION, FIVEM_CEF_LABEL } from './constants';

export { installCefPolyfills } from './polyfills';

export { isCefPanelEmbed, isCefPanelRuntime, isFiveMNuiPanel } from './runtime';

/**

 * Installs all runtime CEF compatibility shims. Safe to call in the browser —

 * polyfills no-op when the native API already exists.

 */

export function installPanelCefCompat(): void {
    installCefPolyfills();
}
