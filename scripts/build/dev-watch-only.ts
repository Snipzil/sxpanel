/**
 * Wrapper around `dev.ts` that forces watch-only mode (no FXServer spawn).
 * Cross-platform alternative to setting TXDEV_NO_SPAWN=1 manually, since
 * Windows shells don't share the same env-var syntax as POSIX shells.
 *
 * Use cases:
 *  - Developing on macOS (where FXServer doesn't run natively).
 *  - Developing against a remote / Dockerized FXServer where you just want
 *    sxPanel to rebuild + sync files into a mounted `monitor/` folder, and
 *    you'll restart FXServer yourself (e.g. via SSH or `docker restart`).
 */
process.env.TXDEV_NO_SPAWN = '1';
await import('./dev');
