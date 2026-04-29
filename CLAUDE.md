# Compte-Pote — Project Context

## What this repo is
French accounting app for independents & TPE. Multi-agent AI developer stack powered by Claude Code.
Tech Lead agent orchestrates specialist agents (frontend, backend, proofreader, cybersecurity).

## Available slash commands
- `/build-feature <description>` — Full-stack feature with all agents
- `/review-pr [PR number or branch]` — Quality + security review of a PR
- `/security-audit [path or "full"]` — Standalone OWASP security audit
- `/frontend-task <description>` — Scoped frontend work only
- `/backend-task <description>` — Scoped backend work only

## Tech stack
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Auth & DB**: Supabase (Auth + Postgres + RLS)
- **Hosting**: Vercel
- **Styling**: Tailwind CSS v4
- **Package manager**: npm

## Project structure
```
/
├── app/
│   ├── (auth)/          # Login page
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── (legal)/         # CGU, mentions légales, politique confidentialité
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Landing page
├── components/          # Shared components (Sidebar, etc.)
├── lib/
│   ├── supabase/        # client.ts, server.ts
│   └── types/           # database.ts (Supabase schema types)
├── middleware.ts         # Auth guard + session refresh
└── supabase/
    └── migrations/      # SQL migrations
```

## Coding standards
- All imports use path alias `@/`
- Commit format: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Branch naming: `feature/short-description`, `fix/issue-number`
- Server Components by default — add `'use client'` only when needed
- All dashboard routes require auth (enforced in middleware + layout)
- Public routes: `/`, `/login`, `/cgu`, `/mentions-legales`, `/politique-confidentialite`
- No raw SQL — use Supabase client queries
- RLS enforces multi-tenant isolation — never bypass except in migration scripts

## Build and test commands
- Install: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`
- Type check: `npm run type-check`
- Lint: `npm run lint`

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only, never exposed to client)

## Agent coordination rules
- Tech Lead plans before delegating — never writes application code itself
- Backend API contracts defined before frontend consumes them
- Proofreader and cybersecurity always run after code is written, not before
- Security agent is read-only — reports findings, never modifies code
