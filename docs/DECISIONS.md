# Decisions

## 2026-10-28 — Marketing "coming soon" page
- Monorepo scaffolded with Turborepo + pnpm (`apps/*`, `packages/*`). Only `apps/marketing` and `packages/ui` are set up so far.
- Brand color tokens in `packages/ui/src/tokens.css` were sampled from the cat mascot (`knoxumi-welcome.png`) because SPEC §3.4 isn't written yet. Replace them when the spec defines the palette.
- The mascot image moved from the repo-root `public/images/` to `apps/marketing/public/images/` so Next.js can serve it.
- TypeScript is pinned to 6.x because typescript-eslint doesn't support TS 7 yet.
- pnpm 12 fails installs on unapproved build scripts. `unrs-resolver`'s script is denied in `pnpm-workspace.yaml` because it ships prebuilt binaries.
