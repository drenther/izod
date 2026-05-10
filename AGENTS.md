# izod

Type-safe iframe communication using the Standard Schema interface for runtime validation.

## Commands

- `pnpm run build` — build all packages with tsdown (via turbo)
- `pnpm run test` — run tests with vitest (via turbo)
- `pnpm run test:coverage` — run tests with coverage
- `pnpm run typecheck` — type-check with tsc (via turbo)
- `pnpm run lint` — oxlint across the repo
- `pnpm run format` — oxfmt across the repo
- `pnpm run format:check` — check formatting

## Conventions

- TypeScript strict mode, target ES2022
- No single-character variable names — use descriptive names
- No nested ternaries
- Conventional Commits enforced via commitlint
- Exact pinned dependency versions (no `~`/`^`), managed via pnpm catalog
- oxlint for linting, oxfmt for formatting (no eslint/prettier)
- Vitest for testing with happy-dom environment
- Turborepo for monorepo orchestration

## Architecture

- `packages/core/` — `@izod/core`: iframe communication engine (no React dependency)
  - `createChild()` — parent-side iframe creation and handshake
  - `connectToParent()` — child-side connection to parent window
  - Uses Standard Schema interface for event data validation
- `packages/react/` — `@izod/react`: React hooks wrapper around core
  - `child.useCreate()` — hook for parent component to create child iframe
  - `parent.useConnect()` — hook for child component to connect to parent
- `examples/` — TanStack Start demo app (workspace package, not published)
- All event schemas accept any Standard Schema compliant validator (zod 3.24+, valibot, arktype, etc.)
- React is a peer dependency of `@izod/react` only

## Supply Chain Config — Do Not Modify Without Approval

This repo enforces strict install-time supply chain defenses:

- Exact pinned versions (no `~`/`^`).
- `minimumReleaseAge` of 7 days (pnpm: minutes).
- Install/lifecycle scripts disabled by default; only packages in
  `onlyBuiltDependencies` (in `pnpm-workspace.yaml`) may run them.
- `blockExoticSubdeps: true`, `trustPolicy: no-downgrade` (in `pnpm-workspace.yaml`).

**Never disable, loosen, or bypass these settings** — including adding packages
to the script allow-list, shortening `minimumReleaseAge`, or setting
`dangerouslyAllowAllBuilds` — without explicit confirmation from the user in
the current conversation. A prior approval does not carry over.
