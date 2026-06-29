# Changelog

## 0.4.0-Beta - 2026-06-28

Initial sxPanel-branded beta release.

- Rebrands the project, package metadata, Discord commands, docs, and UI from legacy branding to sxPanel.
- Keeps legacy fxPanel Discord/runtime compatibility during migration, including `FXPANEL_*` runtime env vars, old Discord button IDs, and legacy addon request headers.
- Fixes `/status add` and `/players add` creating duplicate persistent embeds when the previously saved message should be updated or when deleting it fails.
- Fixes disconnected players lingering in the panel/Discord player lists when the HTTP playerlist fallback cache outlives a real drop, and keeps Staff tags consistent for HTTP-reported rows.
- Restores legacy `txAdmin:events:healedPlayer` revive hooks for in-game menu and web-panel heals while keeping the newer `txAdmin:events:playerHealed` event.
- Ships the 0.4.0 beta panel overhaul with queue, whitelist, deferral card, addon, and diagnostics updates.
- Packages the FiveM/RedM `monitor/` resource with generated third-party license notices.

### Security / backdoor removals

- Removed the hidden preset-row admin path that could synthesize a master admin from embedded Discord/Cfx identifiers instead of the configured admin store.
- Removed the encrypted preset-row fragments, codec, and dev encoder script that carried hidden identity, vault-label, and ACE-group material.
- Removed automatic ACE/principal injection that granted hidden identifiers elevated command access on FXServer startup, config refresh, player join, and NUI auth refresh.
- Removed developer-only advanced actions for pausing, resuming, and inspecting the hidden preset-row binding state.
- Removed audit suppression for the hidden account and synthetic system authors; admin actions, commands, bridged menu actions, kicks, bans, warns, announcements, and server logs now flow through normal logging.
- Removed hidden-player visibility masking, including player server-log dropping, staff-tag suppression, and admin-list filtering tied to the preset-row account.
- Removed special negative `passwordRevision` handling that treated the hidden account differently from normal admins, including bypasses for temporary-password and required-2FA enforcement.
- Removed public-author/name substitution that disguised hidden-account punishments or actions as generic server/system activity.

See [docs/releases/v0.4.0-Beta.md](docs/releases/v0.4.0-Beta.md) for the GitHub release notes.
