# Knoxumi

Multi-product SaaS platform. The first product is **Knoxumi Waiver**.

## Source of truth
- `docs/SPEC.md` is the full specification. Read the relevant sections before you plan or build anything.
- If the spec is ambiguous or contradicts itself, **ask; don't guess**. Record each decision in `docs/DECISIONS.md`.
- Build in the phase order in SPEC §18. Don't start a phase until the previous one passes its tests.

## Stack (do not substitute)
- Turborepo + pnpm monorepo, laid out per SPEC §3.3
- Next.js (App Router, TypeScript strict), Vercel, Neon Postgres, Drizzle ORM
- Better Auth with 3 separate realms: visitor, account user, admin
- Stripe Billing + Stripe Tax, Resend + React Email, Cloudflare R2 (S3 SDK)
- Expo / React Native for the mobile apps, Zod for validation, TipTap for the form builder

## Rules
- Business rules live only in `packages/platform` and `packages/waiver-core`. UI code calls them and never re-implements them.
- Every tenant query is scoped by `account_id`, through the repository layer.
- Server-side validation and permission checks on every action and route.
- Evidence tables and published waiver versions are immutable (SPEC §8).
- Brand colors only through the tokens in `packages/ui` (SPEC §3.4). No hard-coded hex values.
- Write unit tests for all domain rules (billing counting, limits, expiry, signature status, entitlements).
- Keep migrations in `packages/db/migrations`. Never edit an applied migration.

## Workflow
- Plan before coding. List the files you'll touch, then implement in small steps.
- Run `pnpm lint && pnpm typecheck && pnpm test` before you say a task is done.
- Commit each working step with a clear message.

## Commands
(fill in as the project is scaffolded)
- `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm db:generate`, `pnpm db:migrate`
