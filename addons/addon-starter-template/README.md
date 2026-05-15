# addon-starter-template

A minimal fxPanel addon template to help you get started quickly. This addon demonstrates:

- **Server routes** — Authenticated GET/POST endpoints
- **Storage** — Persistent key-value data
- **Events** — Listening for game events (player join/drop)
- **WebSocket push** — Real-time updates to the panel
- **Discord slash command** — A standalone bot command loaded from the addon manifest
- **Panel page** — Full page in the sidebar
- **Panel widget** — Dashboard widget

## Getting Started

1. Copy this entire `addon-starter-template/` directory
2. Rename the folder to your addon's ID (e.g. `my-cool-addon`)
3. Update `addon.json` with your addon's details (id, name, description, author)
4. Modify `server/index.js` to add your server-side logic
5. Modify `panel/index.js` to build your panel UI
6. Restart fxPanel and approve your addon from the Addons page

## File Structure

```text
addon-starter-template/
├── addon.json           ← Manifest (metadata, permissions, entry points)
├── package.json         ← Must have "type": "module"
├── README.md            ← This file
├── discord-bot/
│   └── commands/
│       ├── fxpanel.js           ← Example static `/fxpanel` slash command
│       └── starter-greeting.js  ← Example bridge-backed slash command
├── server/
│   └── index.js         ← Server-side code (runs in isolated child process)
└── panel/
    └── index.js         ← Panel UI components (React, loaded at runtime)
```

## Customization Checklist

- [ ] Rename the directory and update `addon.json` → `id`
- [ ] Update name, description, author, and version in `addon.json`
- [ ] Adjust `permissions.required` and `permissions.optional`
- [ ] Update or remove the `discordBot` section in `addon.json`
- [ ] Update the URL or response text in `discord-bot/commands/fxpanel.js`
- [ ] Update the `ADDON_ID` constant in `discord-bot/commands/starter-greeting.js`
- [ ] Update `panel.pages[].component` names to match your exports
- [ ] Update `panel.widgets[].component` names to match your exports
- [ ] Update `ADDON_ID` constant in `panel/index.js`
- [ ] Replace `API_BASE` path in `panel/index.js`

## Tips

- React is available globally — do NOT bundle it in your panel entry
- Always call `addon.ready()` at the end of your server entry
- Use `addon.log.info/warn/error()` instead of `console.log`
- Check permissions in route handlers with `req.admin.hasPermission('perm')`
- Use `addon.storage.getOr(key, default)` for safe defaults
- Use wildcard routes (`/*`) for SPA catch-all patterns

## Discord Example

The template includes two Discord command examples:

How it works:

- `addon.json` points `discordBot.commands` at `discord-bot/commands`
- `addon.json` also applies a default Discord rate limit for this addon (`5` requests per `15s` per user/handler)
- The standalone bot auto-loads that folder when the addon is running
- `discord-bot/commands/fxpanel.js` registers `/fxpanel` and replies with the fxPanel website link
- `discord-bot/commands/starter-greeting.js` registers `/starter-greeting`, provides autocomplete suggestions, and routes button/modal interactions through the addon's `/greeting` server route

Use `fxpanel.js` as the minimal static-reply example, and use `starter-greeting.js` as the pattern when a Discord command needs autocomplete, buttons, modals, or server-route calls. Command files still receive the raw bridge helper in `execute(interaction, bridge)`, but the supported path is to wrap it with `createAddonDiscordSdk({ addonId, bridge })` so requester payloads, namespaced custom IDs, and bridge calls stay typed and reusable.

The starter command uses the SDK helpers introduced for v0.3.X:

- `discord.respondWithChoices(interaction, choices)` for slash-command autocomplete responses
- `discord.interactions.button(...)` to attach a namespaced addon button custom ID
- `discord.interactions.modal(...)` to attach a namespaced addon modal custom ID
- `buttons` and `modals` handler maps on the exported command object so the standalone bot can dispatch those interactions back into the addon
- `discordBot.rateLimit` in `addon.json` for a per-addon runtime default

### Local Mock Bridge

When you want to iterate on a command without a live bot runtime, you can swap in the SDK's mock bridge:

```js
import { createAddonDiscordSdk, createMockDiscordBridge } from 'addon-sdk/discord';

const discord = createAddonDiscordSdk({
    addonId: 'addon-starter-template',
    bridge: createMockDiscordBridge({
        handlers: {
            addonRoute: (payload) => ({
                status: 200,
                body: {
                    message: `Mocked response for ${payload.path}`,
                },
            }),
        },
    }),
});
```

That mock keeps request history, supports custom request handlers, and lets you exercise command logic before wiring the command into the standalone bot.

## License

MIT
