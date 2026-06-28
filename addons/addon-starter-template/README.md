# addon-starter-template

Example addon: a small **shift board** for staff — server pulse (join/drop traffic), who's clocked in, a pin wall, and a live traffic feed. The UI is deliberately built like a real feature so you can copy the patterns, not just hello-world routes.

Docs: [sxPanel addon development](https://github.com/sxPanel/sxPanel-Docs/tree/main/v0.4.0-Beta)

## What it does

- **Server** (`server/index.js`) — API routes, scoped storage, game event listeners, optional `ws.push` to the panel.
- **Panel** (`panel/index.js`) — React page + dashboard widget. Calls your routes through `/addons/addon-starter-template/api/*` with CSRF via `txAddonApi`.
- **In-game** (`resource/*.lua` + `nui/index.js`) — Lua reads live server natives, client forwards to the admin menu NUI, NUI POSTs to `/ingame/push` so the panel can `GET /ingame`.
- **Discord** (`discord-bot/commands/`) — Two sample slash commands: a static reply, and one that hits the same server routes as the panel (`addonRoute`), so logic stays in one place.

`addon.json` wires those pieces together (permissions, page path, widget slot, Discord command folder).

## Developing on this repo

sxPanel addons are split across a few runtimes. That affects what you need to reload after a change.

**Where files live**

- You edit addons under `sxPanel/addons/<id>/` in the git repo.
- A running dev server does **not** read that folder directly. `npm run dev` copies `addons/` into the FXServer monitor resource at `TXDEV_FXSERVER_PATH/citizen/system_resources/monitor/addons/`. That copy is what sxPanel loads and serves.

**Panel UI** (`panel/index.js`)

- Served as a static JS file from the monitor addon path, then imported by the panel shell.
- After you save, a normal browser refresh is enough (the manifest cache-busts the entry URL).
- React is already global in the panel — don't bundle it in your addon build.

**Server** (`server/index.js`)

- Runs in a separate addon process started by sxPanel.
- Saving the file on disk is not enough: use **Addons → Reload** on this addon so the process restarts and picks up new routes.
- If the page loads but API calls return `Route not found`, the panel updated and the server did not.

**In-game (Lua + NUI)**

- `resource/sv_shift.lua` is picked up automatically (`addons/**/resource/sv_*.lua` in the built `fxmanifest`).
- `resource/cl_shift.lua` is included the same way after a dev build (`addons/**/resource/cl_*.lua`).
- `nui/index.js` loads when you open the in-game admin menu (WebPipe). It listens for Lua snapshots and POSTs them to the addon API.
- Restart the **monitor** resource (or full FXServer) after adding Lua/client scripts the first time so FiveM loads the new `client_scripts` list.
- NUI/CSS changes: close and reopen the menu, or trigger `txAdmin:refreshNui` on the client.

**Discord commands**

- Loaded by the standalone bot from your addon folder when the addon is running.
- Same reload rules as the server if you change command files or routes they call.

**Permissions**

- `storage` is required for pins, visits, shift roster, duty-hour totals, and activity history.
- `ws.push` is optional — without it, the UI still works but live updates fall back to refetching.
- `players.write` is checked in route handlers for posting pins; granting it in the manifest alone is not enough.
- **View Duty Hours** (`addon-starter-template.view-duty-hours`) — custom addon permission in Admin → Roles. Everyone sees their own session/total on the shift board; this permission unlocks the all-staff duty hours table.

**Duty tracking**

- Staff **clock in / out** on the shift board (panel or in-game HUD via the same API).
- Time accrues while on duty; **clocking out** adds the session to cumulative storage (`dutyTotals`).
- **In-game staff** list comes from Lua (`TX_ADMINS` — admins with an authenticated menu session). Open the in-game menu so `nui/index.js` can POST a snapshot and refresh the roster.

## Making it your own

Copy this folder to `addons/<your-id>/`, rename `id` in `addon.json`, and replace `addon-starter-template` anywhere it appears in `server/index.js`, `panel/index.js`, and the Discord command that references the addon ID. Approve the new addon in the panel, then reload it once.

## License

MIT
