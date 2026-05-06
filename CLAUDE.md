# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

French accounting SaaS (Compte-Pote) for independents and SMEs — invoices, expenses, VAT, annual accounts, and bank sync. Built with a multi-agent AI developer stack where a Tech Lead agent orchestrates backend-dev, frontend-dev, proofreader, and cybersecurity agents.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build
npm run type-check   # tsc --noEmit  ← run this before every commit
npm run lint         # ESLint
```

No test suite — `type-check` and `lint` are the verification layer. Always run `type-check` after any TypeScript change.

## Architecture

### Multi-tenant isolation

Every business table has `workspace_id UUID` enforced by Postgres RLS. The Postgres function `auth_workspace_ids()` returns the current user's workspace IDs and is called in every RLS policy. **Never bypass RLS** outside of migration scripts.

Two Supabase clients:
- `lib/supabase/client.ts` — browser client for `'use client'` components
- `lib/supabase/server.ts` — cookie-based SSR client for Server Components and Server Actions; also exports `createServiceClient()` which uses the service role key and bypasses RLS — only for admin ops (e.g. reading `auth.users` emails in `listMembersWithEmail`)

### Auth & session flow

`middleware.ts` refreshes the Supabase session on every request and redirects unauthenticated users to `/login`. The dashboard layout (`app/(dashboard)/layout.tsx`) reads the workspace and user then passes them to `<Sidebar>`. Public routes: `/`, `/login`, `/cgu`, `/mentions-legales`, `/politique-confidentialite`.

### Rendering model

Server Components by default. Add `'use client'` only for interactive state (forms, optimistic updates, browser APIs). Server Actions live in `[feature]/actions.ts` co-located with their page — they import from `lib/supabase/server.ts`, not the client.

### Email — two separate systems

| Use case | System | Key file |
|---|---|---|
| Workspace invitations | Resend API (custom token in `invitations` table) | `lib/email.ts` |
| Password reset / auth | Supabase Auth native SMTP | Supabase Dashboard → Auth → SMTP |

Env vars needed beyond Supabase: `RESEND_API_KEY`, `RESEND_FROM`, `NEXT_PUBLIC_APP_URL`.

## CSS conventions

Dashboard pages use custom CSS classes — **not Tailwind utilities**. Add new classes to `app/globals.css`.

| Prefix | Scope |
|--------|-------|
| `.dash-*` | Dashboard cards, tables, buttons, forms, badges |
| `.sb-*` | Sidebar and mobile top bar |
| `.auth-*` | Auth pages |
| `.settings-*` | Settings layout and nav rail |
| `.invite-*` | Invite modal |
| `.ln-*` | Landing page |

Design tokens (CSS vars): `--ink` `--pencil` `--paper` `--rule` `--offwhite`. Typography: Special Elite (headings), Courier Prime (labels/mono), Inter (body).

## Database migrations

1. Add `supabase/migrations/YYYYMMDD_description.sql`
2. Apply: Supabase SQL Editor → paste, or `supabase db push` with CLI
3. **Manually update `lib/types/database.ts`** — types are hand-maintained, not auto-generated

The migration files are the source of truth for schema; `lib/types/database.ts` must stay in sync.

## Domain map

| Feature | Path |
|---------|------|
| Settings / workspace / team | `app/(dashboard)/workspace/` |
| Transactions / invoices | `app/(dashboard)/transactions/` |
| VAT (TVA) | `app/(dashboard)/tva/` |
| Annual accounts | `app/(dashboard)/exercice/` |
| Expense reports | `app/(dashboard)/notes-de-frais/` |
| Bank integrations (Qonto, Shine) | `app/(dashboard)/integrations/`, `app/api/qonto/sync/`, `app/api/shine/sync/` |
| Auth pages | `app/(auth)/` |
| Auth callback (PKCE) | `app/auth/callback/` |
| Shared DB types | `lib/types/database.ts` |
| Categories & TVA helpers | `lib/categories.ts`, `lib/tva-validation.ts` |

## Slash commands

**Build**
- `/build-feature <description>` — Full-stack: Tech Lead → backend-dev → frontend-dev → proofreader + cybersecurity
- `/frontend-task <description>` — Frontend only (skips backend and review agents)
- `/backend-task <description>` — Backend only

**Fix & debug**
- `/focused-fix <feature-path>` — 5-phase systematic repair across all files of a feature

**Quality**
- `/review-pr [PR or branch]` — Code quality + security dual review
- `/security-audit [path|"full"]` — Standalone OWASP audit
- `/a11y-audit [path]` — WCAG 2.2 accessibility scan and auto-fix

**Design**
- `/ui-ux-pro-max` — Full design intelligence: design system, style, palette, typography for a new UI

**Product**
- `/prd <feature>` — Product requirements document
- `/user-story <generate|sprint N>` — INVEST-compliant user stories

**Maintenance**
- `/tech-debt` — Scan and prioritize technical debt
- `/changelog` — Generate changelog from git history

## Agent team

| Agent | Responsibility |
|-------|---------------|
| `tech-lead` | Plans, decomposes, delegates — never writes app code |
| `backend-dev` | Server Actions, API routes, Supabase queries, migrations |
| `frontend-dev` | React components, pages, CSS, hooks |
| `proofreader` | Code quality, naming, dead code |
| `cybersecurity` | OWASP, RLS/auth correctness, secrets |

**Sequence rule**: backend contract must be defined before frontend-dev starts. Proofreader + cybersecurity always run in parallel *after* dev is complete.

## Coding standards

- Path alias `@/` for all project imports
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
- No raw SQL — use Supabase client query builder
- `SUPABASE_SERVICE_ROLE_KEY` is server-only — never import into client-side code
