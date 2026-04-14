## Supply Chain Config — Do Not Modify Without Approval

This repo enforces strict install-time supply chain defenses:

- Exact pinned versions (no `~`/`^`).
- `minimumReleaseAge` of 7 days (pnpm: minutes, bun: seconds).
- Install/lifecycle scripts disabled by default; only packages in
  `onlyBuiltDependencies` (pnpm) or `trustedDependencies` (bun) may run them.
- pnpm: `block-exotic-subdeps=true`, `trust-policy=no-downgrade`.
- bun: Socket security scanner enabled in `bunfig.toml`.

**Never disable, loosen, or bypass these settings** — including adding packages
to the script allow-list, shortening `minimumReleaseAge`, or setting
`dangerouslyAllowAllBuilds` — without explicit confirmation from the user in
the current conversation. A prior approval does not carry over.
